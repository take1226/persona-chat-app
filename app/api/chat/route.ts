import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { chatWithRetry, decideImageIndex, withTimeout, isPlaceholderReply, PLACEHOLDER_CONTENTS } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { buildSystemPrompt } from '@/lib/chat/buildSystemPrompt'
import { buildMessages } from '@/lib/chat/buildMessages'
import { validatePersonaCard } from '@/lib/persona/card'

export const maxDuration = 60

const FAST_TIMEOUT_MS = 20000
const SLOW_TIMEOUT_MS = 30000

// 2段階応答のつなぎ文（is_placeholder: true を付けて保存する）
const BRIDGE_TEXTS = PLACEHOLDER_CONTENTS.slice(0, 5)

function randomBridge(): string {
  return BRIDGE_TEXTS[Math.floor(Math.random() * BRIDGE_TEXTS.length)]
}

function splitBubbles(text: string): string[] {
  const raw = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  if (raw.length > 1) return raw.slice(0, 4)
  const sentences = text.split(/(?<=[。！？\n])/).map(s => s.trim()).filter(Boolean)
  return sentences.length > 1 ? sentences.slice(0, 4) : [text.trim()]
}

type TurnExample = { user: string; persona: string }

export async function POST(req: NextRequest) {
  try {
    const { persona_id, user_message } = await req.json()
    const db = adminDb()

    const [personaDoc, messagesSnap, imagesSnap, turnExamplesSnap] = await Promise.all([
      db.collection('personas').doc(persona_id).get(),
      db.collection('personas').doc(persona_id)
        .collection('messages')
        .orderBy('created_at', 'desc')
        .limit(40)
        .get(),
      db.collection('personas').doc(persona_id)
        .collection('images')
        .orderBy('send_count', 'asc')
        .limit(10)
        .get(),
      db.collection('personas').doc(persona_id)
        .collection('turn_examples')
        .orderBy('created_at', 'asc')
        .limit(20)
        .get(),
    ])

    if (!personaDoc.exists) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    const persona = personaDoc.data()!
    const card = validatePersonaCard(persona.card ?? persona.raw_analysis)

    // サブコレクションの手入力ペアを優先し、なければドキュメントフィールドにフォールバック
    const manualExamples = turnExamplesSnap.docs
      .map(d => d.data() as { user: string; persona: string })
      .filter(d => typeof d.user === 'string' && typeof d.persona === 'string')
    const turnExamples: TurnExample[] = manualExamples.length > 0
      ? manualExamples
      : (persona.turn_examples ?? []) as TurnExample[]

    // 定型文・つなぎ文をフィルタしてから AI コンテキストに渡す
    const recentHistory = messagesSnap.docs.reverse()
      .map(d => {
        const m = d.data() as { role: string; content?: string; is_placeholder?: boolean }
        return {
          role: m.role,
          content: m.content ?? '',
          is_placeholder: m.is_placeholder ?? false,
        }
      })
      .filter(m => !m.is_placeholder && !isPlaceholderReply(m.content))
      .map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content || '[画像を送信]',
      }))

    const images = imagesSnap.docs.map(d => ({
      id: d.id,
      ...d.data() as { public_url: string; category: string; description: string; tags?: string[]; send_count: number },
    }))

    const systemPrompt = buildSystemPrompt(card, persona.name)
    // turn_examples があれば card.examples の代わりに few-shot として使う
    const messages = buildMessages(card, recentHistory, turnExamples.length > 0 ? turnExamples : undefined)

    // ① 高速パス: 20秒以内に応答が得られるか試みる
    const fastReply = await withTimeout(
      chatWithRetry(systemPrompt, messages, user_message, 300),
      FAST_TIMEOUT_MS,
    )

    if (fastReply) {
      // 応答後に画像判断（直列、API コールを1本ずつに絞る）
      let imageDecision = 'none'
      if (images.length > 0) {
        imageDecision = await decideImageIndex(user_message, images)
      }

      const bubbleTexts = splitBubbles(fastReply)
      const now = Timestamp.now()

      const savedBubbles: Array<{ id: string; text: string }> = []
      for (const text of bubbleTexts) {
        const ref = await db.collection('personas').doc(persona_id).collection('messages').add({
          role: 'assistant',
          content: text,
          message_type: 'text',
          is_auto_message: false,
          is_placeholder: false,
          created_at: Timestamp.now(),
        })
        savedBubbles.push({ id: ref.id, text })
      }

      const imageToSend = imageDecision !== 'none'
        ? (() => { const idx = parseInt(imageDecision); return !isNaN(idx) && images[idx] ? images[idx] : null })()
        : null

      let savedImage: { id: string; url: string } | null = null
      if (imageToSend) {
        const ref = await db.collection('personas').doc(persona_id).collection('messages').add({
          role: 'assistant',
          content: null,
          image_url: imageToSend.public_url,
          message_type: 'image',
          is_auto_message: false,
          is_placeholder: false,
          created_at: Timestamp.now(),
        })
        savedImage = { id: ref.id, url: imageToSend.public_url }
        db.collection('personas').doc(persona_id).collection('images').doc(imageToSend.id).update({
          send_count: (imageToSend.send_count ?? 0) + 1,
        }).catch(() => {})
      }

      db.collection('personas').doc(persona_id).update({ updated_at: now }).catch(() => {})

      return NextResponse.json({ bubbles: savedBubbles, image: savedImage })
    }

    // ② 低速パス: つなぎ文を is_placeholder: true で即保存し、本応答はバックグラウンドへ
    const bridgeText = randomBridge()
    const bridgeRef = await db.collection('personas').doc(persona_id).collection('messages').add({
      role: 'assistant',
      content: bridgeText,
      message_type: 'text',
      is_auto_message: false,
      is_placeholder: true,
      created_at: Timestamp.now(),
    })

    after(async () => {
      try {
        const realReply = await withTimeout(
          chatWithRetry(systemPrompt, messages, user_message, 300),
          SLOW_TIMEOUT_MS,
        )
        const finalText = realReply || `${persona.name}からの返信が届きませんでした。もう一度メッセージを送ってみてください。`
        const finalBubbles = splitBubbles(finalText)
        for (const text of finalBubbles) {
          await db.collection('personas').doc(persona_id).collection('messages').add({
            role: 'assistant',
            content: text,
            message_type: 'text',
            is_auto_message: false,
            is_placeholder: false,
            created_at: Timestamp.now(),
          })
        }
      } catch {
        await db.collection('personas').doc(persona_id).collection('messages').add({
          role: 'assistant',
          content: `${persona.name}からの返信が届きませんでした。もう一度メッセージを送ってみてください。`,
          message_type: 'text',
          is_auto_message: false,
          is_placeholder: false,
          created_at: Timestamp.now(),
        }).catch(() => {})
      }
      db.collection('personas').doc(persona_id).update({ updated_at: Timestamp.now() }).catch(() => {})
    })

    return NextResponse.json({
      bubbles: [{ id: bridgeRef.id, text: bridgeText }],
      image: null,
    })
  } catch (err) {
    console.error('[chat] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
