import { NextRequest, NextResponse } from 'next/server'
import { chat, decideImageIndex } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  const { persona_id, user_message } = await req.json()
  const db = adminDb()

  const personaDoc = await db.collection('personas').doc(persona_id).get()
  if (!personaDoc.exists) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  }
  const persona = personaDoc.data()!

  const messagesSnap = await db
    .collection('personas').doc(persona_id)
    .collection('messages')
    .orderBy('created_at', 'desc')
    .limit(20)
    .get()

  const history = messagesSnap.docs.reverse().map(d => {
    const m = d.data() as { role: string; content?: string }
    return {
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content ?? '[画像を送信]',
    }
  })

  const now = Timestamp.now()
  await db.collection('personas').doc(persona_id).collection('messages').add({
    role: 'user',
    content: user_message,
    message_type: 'text',
    is_auto_message: false,
    created_at: now,
  })

  const imagesSnap = await db
    .collection('personas').doc(persona_id)
    .collection('images')
    .orderBy('send_count', 'asc')
    .limit(10)
    .get()

  const images = imagesSnap.docs.map(d => ({ id: d.id, ...d.data() as {
    public_url: string; category: string; description: string; tags?: string[]; send_count: number
  }}))

  let imageToSend: (typeof images)[0] | null = null
  if (images.length > 0) {
    const decision = await decideImageIndex(user_message, images)
    if (decision !== 'none') {
      const idx = parseInt(decision)
      if (!isNaN(idx) && images[idx]) {
        imageToSend = images[idx]
        await db.collection('personas').doc(persona_id).collection('images').doc(imageToSend.id).update({
          send_count: (imageToSend.send_count ?? 0) + 1,
        })
      }
    }
  }

  const systemPrompt = persona.system_prompt ?? `あなたは${persona.name}として自然に会話してください。`
  const replyText = await chat(systemPrompt, history, user_message, 500)

  await db.collection('personas').doc(persona_id).collection('messages').add({
    role: 'assistant',
    content: replyText,
    message_type: 'text',
    is_auto_message: false,
    created_at: Timestamp.now(),
  })

  if (imageToSend) {
    await db.collection('personas').doc(persona_id).collection('messages').add({
      role: 'assistant',
      content: null,
      image_url: imageToSend.public_url,
      message_type: 'image',
      is_auto_message: false,
      created_at: Timestamp.now(),
    })
  }

  await db.collection('personas').doc(persona_id).update({ updated_at: Timestamp.now() })

  return NextResponse.json({
    reply: replyText,
    image: imageToSend ? { url: imageToSend.public_url } : null,
  })
}
