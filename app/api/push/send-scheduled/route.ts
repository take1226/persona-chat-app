import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { sendPushToAll } from '@/lib/push'
import { Timestamp } from 'firebase-admin/firestore'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = adminDb()
  const personasSnap = await db.collection('personas').where('auto_message_enabled', '==', true).get()
  if (personasSnap.empty) return NextResponse.json({ ok: true, sent: 0 })

  const now = new Date()
  let sent = 0

  for (const personaDoc of personasSnap.docs) {
    const persona = personaDoc.data() as {
      name: string; system_prompt?: string;
      auto_message_interval_min?: number; auto_message_interval_max?: number;
      last_auto_message_at?: Timestamp;
    }

    const minInterval = persona.auto_message_interval_min ?? 5
    const maxInterval = persona.auto_message_interval_max ?? 30

    if (persona.last_auto_message_at) {
      const lastSent = persona.last_auto_message_at.toDate()
      const diffMinutes = (now.getTime() - lastSent.getTime()) / 60000
      if (diffMinutes < minInterval) continue
      const probability = Math.min((diffMinutes - minInterval) / (maxInterval - minInterval), 1.0)
      if (Math.random() > probability) continue
    }

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

    const systemPrompt = `${persona.system_prompt ?? `あなたは${persona.name}として振る舞ってください。`}

【追加指示】
あなたは今、相手に自分から連絡を取ろうとしています。最後のメッセージから約${minutesSince}分経っています。
この人物らしい、自然な「自発的なメッセージ」を1〜2文で送ってください。返答は送るメッセージ本文のみ。`

    let autoMessage = ''
    try {
      const trigger = history.length > 0 ? '（しばらく時間が経ちました）' : '（久しぶりに連絡します）'
      autoMessage = await chat(systemPrompt, history, trigger, 200)
    } catch { continue }

    if (!autoMessage) continue

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
