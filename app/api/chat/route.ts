import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { chatWithRetry, decideImageIndex, withTimeout } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { buildSystemPrompt } from '@/lib/chat/buildSystemPrompt'
import { buildMessages } from '@/lib/chat/buildMessages'
import { validatePersonaCard } from '@/lib/persona/card'

export const maxDuration = 60

// 20秒以内に AI 応答が得られなければつなぎ文に切り替える
const FAST_TIMEOUT_MS = 20000
const SLOW_TIMEOUT_MS = 30000

const PLACEHOLDER_TEXTS = [
  'ちょっと待って〜',
  'えっと……',
  'あー、うん、ちょっとだけ待ってて',
  'もうちょい待ってほしい！',
  'うん！今返すね',
]

function randomPlaceholder(): string {
  return PLACEHOLDER_TEXTS[Math.floor(Math.random() * PLACEHOLDER_TEXTS.length)]
}

function splitBubbles(text: string): string[] {
  const raw = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  if (raw.length > 1) return raw.slice(0, 4)
  const sentences = text.split(/(?<=[。！？\n])/).map(s => s.trim()).filter(Boolean)
  return sentences.length > 1 ? sentences.slice(0, 4) : [text.trim()]
}

export async function POST(req: NextRequest) {
  try {
    const { persona_id, user_message } = await req.json()
    const db = adminDb()

    const [personaDoc, messagesSnap, imagesSnap] = await Promise.all([
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
    ])

    if (!personaDoc.exists) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    const persona = personaDoc.data()!
    const card = validatePersonaCard(persona.card ?? persona.raw_analysis)

    const recentHistory = messagesSnap.docs.reverse().map(d => {
      const m = d.data() as { role: string; content?: string }
      return {
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content ?? '[画像を送信]',
      }
    })

    const images = imagesSnap.docs.map(d => ({
      id: d.id,
      ...d.data() as { public_url: string; category: string; description: string; tags?: string[]; send_count: number },
    }))

    const systemPrompt = buildSystemPrompt(card, persona.name)
    const messages = buildMessages(card, recentHistory)

    // ① チャット応答を先に取得（FAST_TIMEOUT_MS で上限設定）
    const fastReply = await withTimeout(
      chatWithRetry(systemPrompt, messages, user_message, 300),
      FAST_TIMEOUT_MS,
    )

    if (fastReply) {
      // 通常フロー: 応答後に画像判断（直列、APIコールを1回ずつに絞る）
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

    // ② 低速パス: つなぎ文を即返し、本応答はバックグラウンドへ
    const placeholderText = randomPlaceholder()
    const placeholderRef = await db.collection('personas').doc(persona_id).collection('messages').add({
      role: 'assistant',
      content: placeholderText,
      message_type: 'text',
      is_auto_message: false,
      created_at: Timestamp.now(),
    })

    after(async () => {
      try {
        const realReply = await withTimeout(
          chatWithRetry(systemPrompt, messages, user_message, 300),
          SLOW_TIMEOUT_MS,
        )
        const finalText = realReply || 'ごめん、ちょっとうまく返せなかった…もう一回送って！'
        const finalBubbles = splitBubbles(finalText)
        for (const text of finalBubbles) {
          await db.collection('personas').doc(persona_id).collection('messages').add({
            role: 'assistant',
            content: text,
            message_type: 'text',
            is_auto_message: false,
            created_at: Timestamp.now(),
          })
        }
      } catch {
        await db.collection('personas').doc(persona_id).collection('messages').add({
          role: 'assistant',
          content: 'ごめん、ちょっとうまく返せなかった…もう一回送って！',
          message_type: 'text',
          is_auto_message: false,
          created_at: Timestamp.now(),
        }).catch(() => {})
      }
      db.collection('personas').doc(persona_id).update({ updated_at: Timestamp.now() }).catch(() => {})
    })

    return NextResponse.json({
      bubbles: [{ id: placeholderRef.id, text: placeholderText }],
      image: null,
    })
  } catch (err) {
    console.error('[chat] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
