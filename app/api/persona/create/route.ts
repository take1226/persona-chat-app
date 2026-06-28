import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { persona_id, profile } = await req.json()
  const supabase = createServerClient()

  const { data: sources } = await supabase
    .from('upload_sources')
    .select('raw_text, source_type, ocr_confidence')
    .eq('persona_id', persona_id)
    .not('raw_text', 'is', null)

  const combinedText = (sources ?? [])
    .map(s => s.raw_text)
    .filter(Boolean)
    .join('\n\n---\n\n')

  if (!combinedText) {
    return NextResponse.json({ error: 'アップロードされた履歴がありません' }, { status: 400 })
  }

  const analysisResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `以下はある人物（「対象者」）のトーク履歴です。対象者の発言パターンを分析して、その人を模倣するためのプロフィールをJSONで出力してください。

【プロフィール】
${JSON.stringify(profile, null, 2)}

【トーク履歴】
${combinedText.substring(0, 15000)}

以下のJSON形式のみで出力（前後の説明不要）：
{
  "vocab_style": "文体・口調の特徴",
  "common_expressions": ["よく使う表現"],
  "emoji_patterns": { "favorites": ["絵文字"], "contexts": "使う場面" },
  "topic_tendencies": { "initiates": ["自分から振る話題"], "responds_well": ["乗ってくる話題"] },
  "reply_style": { "length": "短文/中文/長文", "speed": "返信速度の傾向" },
  "emotional_patterns": "感情表現の特徴",
  "system_prompt": "この人物を演じるためのシステムプロンプト（500字程度、一人称で書く）"
}`,
    }],
  })

  let analysis: Record<string, unknown> = {}
  let systemPrompt = `あなたは${profile.name}として振る舞ってください。`

  try {
    const text = analysisResponse.content[0].type === 'text' ? analysisResponse.content[0].text : ''
    analysis = JSON.parse(text.replace(/```json|```/g, '').trim())
    systemPrompt = analysis.system_prompt as string ?? systemPrompt
  } catch { /* fallback */ }

  const { data, error } = await supabase
    .from('personas')
    .update({
      system_prompt: systemPrompt,
      raw_analysis: analysis,
      profile,
      updated_at: new Date().toISOString(),
    })
    .eq('id', persona_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('upload_sources')
    .update({ processed: true })
    .eq('persona_id', persona_id)

  return NextResponse.json({ success: true, persona: data, analysis })
}
