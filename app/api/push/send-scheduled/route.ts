import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/push'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * このAPIは Vercel Cron（vercel.json で設定）から定期的に呼ばれる。
 * 各ペルソナのインターバルを確認し、時間が来ていたら自発メッセージを生成 + プッシュ通知を送る。
 *
 * Vercel Cron は無料プランで 1日1回まで、Pro で毎分まで対応。
 * 5〜30分ランダムのインターバルは「最後に送った時刻」をDBに記録して判定する。
 */
export async function GET(req: NextRequest) {
  // Vercel Cron の認証ヘッダーチェック
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // 自発メッセージが有効なペルソナを全取得
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
    // インターバル判定：前回送信時刻 + ランダム分数 < 現在時刻 なら送信
    const minInterval = persona.auto_message_interval_min ?? 5
    const maxInterval = persona.auto_message_interval_max ?? 30

    // このペルソナ専用のランダムインターバルを決定
    // （実際のランダム性はDBに記録した「次の送信予定時刻」で管理するのが理想だが、
    //   シンプルにするため「前回から最低minInterval分経過」かつ「確率的に送る」方式）
    if (persona.last_auto_message_at) {
      const lastSent = new Date(persona.last_auto_message_at)
      const diffMinutes = (now.getTime() - lastSent.getTime()) / 1000 / 60

      // 最低インターバル未満なら skip
      if (diffMinutes < minInterval) continue

      // maxInterval に近づくほど送信確率が上がる（線形）
      const probability = Math.min((diffMinutes - minInterval) / (maxInterval - minInterval), 1.0)
      if (Math.random() > probability) continue
    }

    // 直近の会話履歴（最大10件）
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('persona_id', persona.id)
      .order('created_at', { ascending: false })
      .limit(10)

    const history = (recentMessages ?? []).reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '[画像]',
    }))

    // 最後のメッセージからの時間
    const lastMessageTime = recentMessages?.[0]?.created_at
    const minutesSinceLastMessage = lastMessageTime
      ? Math.floor((now.getTime() - new Date(lastMessageTime).getTime()) / 1000 / 60)
      : 999

    // 自発メッセージ生成
    let autoMessage = ''
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: `${persona.system_prompt ?? `あなたは${persona.name}として振る舞ってください。`}

【追加指示】
あなたは今、相手に自分から連絡を取ろうとしています。
最後のメッセージから約${minutesSinceLastMessage}分経っています。
この人物らしい、自然な「自発的なメッセージ」を1〜2文で送ってください。
例：何かふと思い出したこと、今の状況の報告、軽い質問、など。
返答は送るメッセージ本文のみ。説明不要。`,
        messages: history.length > 0
          ? [...history, { role: 'user' as const, content: '（しばらく時間が経ちました）' }]
          : [{ role: 'user' as const, content: '（久しぶりに連絡します）' }],
      })
      autoMessage = response.content[0].type === 'text' ? response.content[0].text : ''
    } catch {
      continue
    }

    if (!autoMessage) continue

    // メッセージをDBに保存
    await supabase.from('messages').insert({
      persona_id: persona.id,
      role: 'assistant',
      content: autoMessage,
      message_type: 'text',
      is_auto_message: true,
    })

    // last_auto_message_at を更新
    await supabase
      .from('personas')
      .update({ last_auto_message_at: now.toISOString() })
      .eq('id', persona.id)

    // プッシュ通知を送信
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'トークアプリ'
    await sendPushToAll({
      title: persona.name,           // 通知センターに「Aさん」と表示
      body: autoMessage,
      persona_id: persona.id,
      url: `/persona/${persona.id}`, // タップでチャット画面を開く
      icon: '/icon-192.png',
    })

    // ログ
    console.log(`[auto-message] ${persona.name}: ${autoMessage.substring(0, 30)}...`)
    sent++
  }

  return NextResponse.json({ ok: true, sent })
}
