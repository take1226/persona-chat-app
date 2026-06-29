import { NextRequest, NextResponse } from 'next/server'
import { chat, decideImageIndex } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

interface RawAnalysis {
  tone?: string
  commonPhrases?: string[]
  emotionalTendency?: 'positive' | 'neutral' | 'negative'
  detailLevel?: 'concise' | 'moderate' | 'detailed'
  textExamples?: string[]
  comprehensivePrompt?: string
}

function buildSystemPrompt(name: string, basePrompt: string, rawAnalysis?: RawAnalysis): string {
  if (!rawAnalysis || !rawAnalysis.comprehensivePrompt) {
    return `${basePrompt}\n\n【返答ルール】\n- 1〜3文で返す（50字以内が目安）\n- 説明・解説は不要。会話だけ。\n- 相手のトーンに合わせる`
  }

  const phrases = rawAnalysis.commonPhrases?.slice(0, 3).join('、') || 'なし'
  const examples = (rawAnalysis.textExamples ?? []).slice(0, 3).map(ex => `・${ex}`).join('\n')
  const moodNote = rawAnalysis.emotionalTendency === 'positive' ? 'ポジティブで楽観的'
    : rawAnalysis.emotionalTendency === 'negative' ? 'やや悲観的'
    : '中立的'

  return `あなたは${name}として返答します。以下の特性を完全に再現してください。

【${name}の特性】
- 口調: ${rawAnalysis.tone || 'カジュアル'}
- 口癖・よく使う表現: ${phrases}
- 感情傾向: ${moodNote}

【実際の会話例】
${examples || 'なし'}

【返答ルール】
- 返答は1〜2文、50字以内が原則
- ${phrases}などを自然に使う
- 説明・解説は不要。会話だけ。
- AIらしい丁寧さは避ける（${moodNote}で人間らしく）`
}

export async function POST(req: NextRequest) {
  const { persona_id, user_message } = await req.json()
  const db = adminDb()

  // Parallel: fetch persona, recent history, and available images simultaneously
  const [personaDoc, messagesSnap, imagesSnap] = await Promise.all([
    db.collection('personas').doc(persona_id).get(),
    db.collection('personas').doc(persona_id)
      .collection('messages')
      .orderBy('created_at', 'desc')
      .limit(20)
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
  const history = messagesSnap.docs.reverse().map(d => {
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

  const basePrompt = persona.behavior_prompt || persona.system_prompt || `あなたは${persona.name}として自然に会話してください。`
  const systemPrompt = buildSystemPrompt(persona.name, basePrompt, persona.raw_analysis)

  // Parallel: generate AI text reply and decide on image simultaneously
  const [rawReplyText, imageDecision] = await Promise.all([
    chat(systemPrompt, history, user_message, 80),
    images.length > 0 ? decideImageIndex(user_message, images) : Promise.resolve('none'),
  ])

  // Trim to 1-2 sentences if too long
  let replyText = rawReplyText
  if (replyText.length > 100) {
    const sentences = replyText.split(/(?<=[。！？\n])/).filter(s => s.trim())
    replyText = sentences.slice(0, 2).join('').trim()
  }

  const imageToSend = imageDecision !== 'none'
    ? (() => { const idx = parseInt(imageDecision); return !isNaN(idx) && images[idx] ? images[idx] : null })()
    : null

  const now = Timestamp.now()

  // Save AI text reply (await — ensures it's in Firestore before we return)
  await db.collection('personas').doc(persona_id).collection('messages').add({
    role: 'assistant',
    content: replyText,
    message_type: 'text',
    is_auto_message: false,
    created_at: now,
  })

  // Fire-and-forget: save optional image message, update image send count, update persona
  if (imageToSend) {
    db.collection('personas').doc(persona_id).collection('messages').add({
      role: 'assistant',
      content: null,
      image_url: imageToSend.public_url,
      message_type: 'image',
      is_auto_message: false,
      created_at: Timestamp.now(),
    }).catch(() => {})

    db.collection('personas').doc(persona_id).collection('images').doc(imageToSend.id).update({
      send_count: (imageToSend.send_count ?? 0) + 1,
    }).catch(() => {})
  }

  db.collection('personas').doc(persona_id).update({ updated_at: Timestamp.now() }).catch(() => {})

  return NextResponse.json({
    reply: replyText,
    image: imageToSend ? { url: imageToSend.public_url } : null,
  })
}
