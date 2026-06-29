import { NextRequest, NextResponse } from 'next/server'
import { generate } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  const { persona_id, profile } = await req.json()
  const db = adminDb()

  const uploadsSnap = await db
    .collection('personas').doc(persona_id)
    .collection('uploads')
    .where('processed', '==', false)
    .get()

  const combinedText = uploadsSnap.docs
    .map(d => (d.data() as { raw_text?: string }).raw_text)
    .filter(Boolean)
    .join('\n\n---\n\n')

  const prompt = combinedText
    ? `以下はある人物（「対象者」）のトーク履歴です。対象者の発言パターンを分析して、その人を模倣するためのプロフィールをJSONで出力してください。

【プロフィール】
${JSON.stringify(profile, null, 2)}

【トーク履歴】
${combinedText.substring(0, 15000)}`
    : `以下のプロフィール情報をもとに、この人物を模倣するためのプロフィールをJSONで出力してください。

【プロフィール】
${JSON.stringify(profile, null, 2)}

以下のJSON形式のみで出力（前後の説明不要）：
{
  "vocab_style": "文体・口調の特徴",
  "common_expressions": ["よく使う表現"],
  "emoji_patterns": { "favorites": ["絵文字"], "contexts": "使う場面" },
  "topic_tendencies": { "initiates": ["自分から振る話題"], "responds_well": ["乗ってくる話題"] },
  "reply_style": { "length": "短文/中文/長文", "speed": "返信速度の傾向" },
  "emotional_patterns": "感情表現の特徴",
  "system_prompt": "この人物を演じるためのシステムプロンプト（500字程度、一人称で書く）"
}`

  let analysis: Record<string, unknown> = {}
  let systemPrompt = `あなたは${profile.name}として振る舞ってください。`

  try {
    const text = await generate(prompt, 4000)
    analysis = JSON.parse(text.replace(/```json|```/g, '').trim())
    systemPrompt = analysis.system_prompt as string ?? systemPrompt
  } catch { /* fallback */ }

  await db.collection('personas').doc(persona_id).update({
    system_prompt: systemPrompt,
    raw_analysis: analysis,
    profile,
    updated_at: Timestamp.now(),
  })

  const batch = db.batch()
  uploadsSnap.docs.forEach(d => batch.update(d.ref, { processed: true }))
  await batch.commit()

  return NextResponse.json({ success: true, analysis })
}
