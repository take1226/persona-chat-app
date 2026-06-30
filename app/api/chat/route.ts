import { NextRequest, NextResponse } from 'next/server'
import { chat, decideImageIndex } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { buildSystemPrompt } from '@/lib/chat/buildSystemPrompt'
import { buildMessages } from '@/lib/chat/buildMessages'
import { validatePersonaCard } from '@/lib/persona/card'

function splitBubbles(text: string): string[] {
  const raw = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  if (raw.length > 1) return raw.slice(0, 4)
  // 単一ブロックが長い場合は文末で分割
  const sentences = text.split(/(?<=[。！？\n])/).map(s => s.trim()).filter(Boolean)
  return sentences.length > 1 ? sentences.slice(0, 4) : [text.trim()]
}

export async function POST(req: NextRequest) {
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

  const [rawReply, imageDecision] = await Promise.all([
    chat(systemPrompt, messages, user_message, 300),
    images.length > 0 ? decideImageIndex(user_message, images) : Promise.resolve('none'),
  ])

  const bubbleTexts = splitBubbles(rawReply)

  const imageToSend = imageDecision !== 'none'
    ? (() => { const idx = parseInt(imageDecision); return !isNaN(idx) && images[idx] ? images[idx] : null })()
    : null

  const now = Timestamp.now()

  // 各バブルを個別メッセージとして保存し、IDを収集
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

  return NextResponse.json({
    bubbles: savedBubbles,
    image: savedImage,
  })
}
