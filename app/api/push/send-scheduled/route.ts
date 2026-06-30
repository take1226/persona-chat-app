import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { sendPushToAll } from '@/lib/push'
import { Timestamp } from 'firebase-admin/firestore'
import { buildSystemPrompt } from '@/lib/chat/buildSystemPrompt'
import { validatePersonaCard } from '@/lib/persona/card'

const MIN_INTERVAL_HOURS = 12
const QUIET_HOURS_START_JST = 0  // JST 0時
const QUIET_HOURS_END_JST = 7    // JST 7時
const SEND_PROBABILITY = 0.6

function jstHour(): number {
  return (new Date().getUTCHours() + 9) % 24
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 深夜帯（JST 0〜7時）はスキップ
  const hour = jstHour()
  if (hour >= QUIET_HOURS_START_JST && hour < QUIET_HOURS_END_JST) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'quiet_hours' })
  }

  const db = adminDb()
  const personasSnap = await db.collection('personas').where('auto_message_enabled', '==', true).get()
  if (personasSnap.empty) return NextResponse.json({ ok: true, sent: 0 })

  const now = new Date()
  let sent = 0

  for (const personaDoc of personasSnap.docs) {
    const persona = personaDoc.data() as {
      name: string
      card?: unknown
      raw_analysis?: unknown
      system_prompt?: string
      last_auto_message_at?: Timestamp
    }

    // 経過時間チェック（最低12時間）
    if (persona.last_auto_message_at) {
      const lastSent = persona.last_auto_message_at.toDate()
      const diffHours = (now.getTime() - lastSent.getTime()) / 3600000
      if (diffHours < MIN_INTERVAL_HOURS) continue
    }

    // 乱数ゲート（機械的連投を防ぐ）
    if (Math.random() > SEND_PROBABILITY) continue

    const card = validatePersonaCard(persona.card ?? persona.raw_analysis)
    const systemPrompt = buildSystemPrompt(card, persona.name)

    const recentSnap = await db
      .collection('personas').doc(personaDoc.id)
      .collection('messages')
      .orderBy('created_at', 'desc')
      .limit(10)
      .get()

    const history = recentSnap.docs.reverse().map(d => {
      const m = d.data() as { role: string; content?: string }
      return { role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.content ?? '[画像]' }
    })

    const lastMsg = recentSnap.docs[0]?.data() as { created_at?: Timestamp } | undefined
    const minutesSince = lastMsg?.created_at
      ? Math.floor((now.getTime() - lastMsg.created_at.toDate().getTime()) / 60000)
      : 999

    // ongoing の話題があればそこから選ぶ
    const ongoingTopic = card.memory.ongoing.length > 0
      ? `【今回触れる話題のヒント】: ${card.memory.ongoing[Math.floor(Math.random() * card.memory.ongoing.length)]}`
      : ''

    const triggerPrompt = `今から${persona.name}として自発的にメッセージを送ります。
最後のやりとりから約${minutesSince}分経っています。
${ongoingTopic}
この人らしい自然なメッセージを1〜2文で送ってください。返答は送るメッセージ本文のみ。`

    let autoMessage = ''
    try {
      autoMessage = await chat(systemPrompt, history, triggerPrompt, 150)
    } catch { continue }

    if (!autoMessage.trim()) continue

    await db.collection('personas').doc(personaDoc.id).collection('messages').add({
      role: 'assistant',
      content: autoMessage,
      message_type: 'text',
      is_auto_message: true,
      created_at: Timestamp.now(),
    })

    await personaDoc.ref.update({ last_auto_message_at: Timestamp.now() })

    await sendPushToAll({
      title: persona.name,
      body: autoMessage,
      persona_id: personaDoc.id,
      url: `/persona/${personaDoc.id}`,
      icon: '/icon-192.png',
    })

    sent++
  }

  return NextResponse.json({ ok: true, sent })
}
