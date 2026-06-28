import { NextRequest, NextResponse } from 'next/server'
import { getAI, MODEL } from '@/lib/gemini'
import { createServerClient } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/push'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: personas } = await supabase
    .from('personas')
    .select('id, name, system_prompt, auto_message_enabled, auto_message_interval_min, auto_message_interval_max, last_auto_message_at')
    .eq('auto_message_enabled', true)

  if (!personas || personas.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  const now = new Date()
  let sent = 0

  for (const persona of personas) {
    const minInterval = persona.auto_message_interval_min ?? 5
    const maxInterval = persona.auto_message_interval_max ?? 30

    if (persona.last_auto_message_at) {
      const lastSent = new Date(persona.last_auto_message_at)
      const diffMinutes = (now.getTime() - lastSent.getTime()) / 1000 / 60

      if (diffMinutes < minInterval) continue

      const probability = Math.min((diffMinutes - minInterval) / (maxInterval - minInterval), 1.0)
      if (Math.random() > probability) continue
    }

    const { data: recentMessages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('persona_id', persona.id)
      .order('created_at', { ascending: false })
      .limit(10)

    const history = (recentMessages ?? []).reverse().map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content ?? '[画像]' }],
    }))

    const lastMessageTime = recentMessages?.[0]?.created_at
    const minutesSinceLastMessage = lastMessageTime
      ? Math.floor((now.getTime() - new Date(lastMessageTime).getTime()) / 1000 / 60)
      : 999

    const systemPrompt = `${persona.system_prompt ?? `あなたは${persona.name}として振る舞ってください。`}

【追加指示】
あなたは今、相手に自分から連絡を取ろうとしています。
最後のメッセージから約${minutesSinceLastMessage}分経っています。
この人物らしい、自然な「自発的なメッセージ」を1〜2文で送ってください。
例：何かふと思い出したこと、今の状況の報告、軽い質問、など。
返答は送るメッセージ本文のみ。説明不要。`

    let autoMessage = ''
    try {
      const response = await getAI().models.generateContent({
        model: MODEL,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 200,
        },
        contents: history.length > 0
          ? [...history, { role: 'user', parts: [{ text: '（しばらく時間が経ちました）' }] }]
          : [{ role: 'user', parts: [{ text: '（久しぶりに連絡します）' }] }],
      })
      autoMessage = response.text ?? ''
    } catch {
      continue
    }

    if (!autoMessage) continue

    await supabase.from('messages').insert({
      persona_id: persona.id,
      role: 'assistant',
      content: autoMessage,
      message_type: 'text',
      is_auto_message: true,
    })

    await supabase
      .from('personas')
      .update({ last_auto_message_at: now.toISOString() })
      .eq('id', persona.id)

    await sendPushToAll({
      title: persona.name,
      body: autoMessage,
      persona_id: persona.id,
      url: `/persona/${persona.id}`,
      icon: '/icon-192.png',
    })

    console.log(`[auto-message] ${persona.name}: ${autoMessage.substring(0, 30)}...`)
    sent++
  }

  return NextResponse.json({ ok: true, sent })
}
