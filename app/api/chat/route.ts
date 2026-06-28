import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { persona_id, user_message } = await req.json()
  const supabase = createServerClient()

  // 1. ペルソナ取得
  const { data: persona } = await supabase
    .from('personas')
    .select('*')
    .eq('id', persona_id)
    .single()

  if (!persona) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  }

  // 2. 直近の会話履歴（最大20件）
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('role, content, message_type, created_at')
    .eq('persona_id', persona_id)
    .order('created_at', { ascending: false })
    .limit(20)

  const history = (recentMessages ?? []).reverse().map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content ?? '[画像を送信]',
  }))

  // 3. ユーザーメッセージを保存
  await supabase.from('messages').insert({
    persona_id,
    role: 'user',
    content: user_message,
    message_type: 'text',
  })

  // 4. 画像を送るべきか判断
  const { data: images } = await supabase
    .from('persona_images')
    .select('id, public_url, category, description, tags, send_count')
    .eq('persona_id', persona_id)
    .order('send_count', { ascending: true })
    .limit(10)

  let imageToSend = null

  if (images && images.length > 0) {
    const imageCheckResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `今の会話の流れで画像を送るべきか判断してください。

【ユーザーのメッセージ】: ${user_message}

【利用可能な画像】:
${images.map((img, i) => `${i}: category=${img.category}, description=${img.description}`).join('\n')}

画像を送るべきであれば番号(0〜${images.length - 1})を、送らなければ "none" を返してください。数字か "none" のみ。`,
      }],
    })

    const decision = imageCheckResponse.content[0].type === 'text'
      ? imageCheckResponse.content[0].text.trim()
      : 'none'

    if (decision !== 'none') {
      const idx = parseInt(decision)
      if (!isNaN(idx) && images[idx]) {
        imageToSend = images[idx]
        await supabase
          .from('persona_images')
          .update({ send_count: (imageToSend.send_count ?? 0) + 1 })
          .eq('id', imageToSend.id)
      }
    }
  }

  // 5. AI テキスト返答生成
  const aiResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: persona.system_prompt ?? `あなたは${persona.name}として自然に会話してください。`,
    messages: [...history, { role: 'user', content: user_message }],
  })

  const replyText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : ''

  // 6. 返答を保存
  await supabase.from('messages').insert({
    persona_id,
    role: 'assistant',
    content: replyText,
    message_type: 'text',
  })

  // 7. 画像メッセージも保存
  if (imageToSend) {
    await supabase.from('messages').insert({
      persona_id,
      role: 'assistant',
      content: null,
      image_id: imageToSend.id,
      message_type: 'image',
    })
  }

  return NextResponse.json({
    reply: replyText,
    image: imageToSend ? { url: imageToSend.public_url, category: imageToSend.category } : null,
  })
}
