import { NextRequest, NextResponse } from 'next/server'
import { generate } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

interface PersonalityProfile {
  tone: string
  keywords: string[]
  responsePatterns: string[]
  emotionalTendency: 'positive' | 'neutral' | 'negative'
  responseSpeed: 'immediate' | 'delayed'
  detailLevel: 'concise' | 'moderate' | 'detailed'
  commonPhrases: string[]
  textExamples: string[]
  comprehensivePrompt: string
}

export async function POST(req: NextRequest) {
  try {
    const { persona_id } = await req.json()
    if (!persona_id) {
      return NextResponse.json({ error: 'persona_id required' }, { status: 400 })
    }

    const db = adminDb()

    const [uploadsSnap, personaDoc] = await Promise.all([
      db.collection('personas').doc(persona_id).collection('uploads')
        .orderBy('created_at', 'desc')
        .limit(10)
        .get(),
      db.collection('personas').doc(persona_id).get(),
    ])

    if (!personaDoc.exists) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    const persona = personaDoc.data()!
    const personaName = persona.name ?? '対象者'

    const allTexts = uploadsSnap.docs
      .map(d => (d.data() as { raw_text?: string }).raw_text)
      .filter((t): t is string => !!t && t !== '[OCR未取得]' && t !== '[画像のみ]')
      .join('\n---\n')
      .substring(0, 5000)

    if (!allTexts) {
      return NextResponse.json(
        { error: 'No valid text extracted', message: 'OCRされたテキストがありません' },
        { status: 400 }
      )
    }

    const prompt = `以下は、ある人物（${personaName}さん）のLINEメッセージのスクショから抽出したテキストです。
このテキストから、${personaName}さんの「人物特性」を多次元で分析してください。

【テキスト】
${allTexts}

【分析項目】
1. tone: 敬語/カジュアル/ユーモア/皮肉/丁寧など
2. keywords: よく使う単語（「〜w」「やばい」など）
3. responsePatterns: 相手の質問にどう返すか（同意/反論/質問返し など）
4. emotionalTendency: positive/neutral/negative
5. responseSpeed: immediate/delayed
6. detailLevel: concise/moderate/detailed
7. commonPhrases: よく使う表現（3-5個）
8. textExamples: 本文から抽出した実際の会話例（3-4件）
9. comprehensivePrompt: ${personaName}さんになりきるための総合プロンプト（5-7文）

以下のJSON形式のみで出力（前後の説明不要）：
{
  "tone": "...",
  "keywords": ["..."],
  "responsePatterns": ["..."],
  "emotionalTendency": "positive",
  "responseSpeed": "immediate",
  "detailLevel": "concise",
  "commonPhrases": ["..."],
  "textExamples": ["相手: ... → ${personaName}さん: ..."],
  "comprehensivePrompt": "..."
}`

    let profileData: PersonalityProfile
    try {
      const raw = await generate(prompt, 2000)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON in response')
      profileData = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      console.error('[analyze-personality] parse error:', parseErr)
      return NextResponse.json({ error: 'Failed to parse personality analysis' }, { status: 500 })
    }

    // Build rich system prompt from analysis
    const richSystemPrompt = buildRichPrompt(personaName, profileData)

    await db.collection('personas').doc(persona_id).update({
      raw_analysis: profileData,
      system_prompt: richSystemPrompt,
      updated_at: Timestamp.now(),
    })

    return NextResponse.json({ success: true, profile: profileData })
  } catch (err: unknown) {
    const error = err as { message?: string }
    console.error('[API] analyze-personality error:', error)
    return NextResponse.json({ error: error?.message ?? 'Internal error' }, { status: 500 })
  }
}

function buildRichPrompt(name: string, p: PersonalityProfile): string {
  const phrases = p.commonPhrases?.slice(0, 3).join('、') || 'なし'
  const examples = (p.textExamples ?? []).slice(0, 3).map(ex => `・${ex}`).join('\n')
  const lengthNote = p.detailLevel === 'concise' ? '短く簡潔に（1〜2文）'
    : p.detailLevel === 'detailed' ? '詳しめに説明する傾向あり'
    : 'バランスよく返す'
  const moodNote = p.emotionalTendency === 'positive' ? 'ポジティブで楽観的'
    : p.emotionalTendency === 'negative' ? 'やや悲観的・シリアス'
    : '中立的'

  return `あなたは${name}として返答します。以下の特性を完全に再現してください。

【${name}の特性】
- 口調: ${p.tone || 'カジュアル'}
- 口癖・よく使う表現: ${phrases}
- 感情傾向: ${moodNote}
- 返答スタイル: ${lengthNote}

【実際の会話例】
${examples || 'なし'}

【返答ルール】
- 返答は1〜3文、50字以内が原則
- ${phrases}などを自然に使う
- 説明・解説は不要。会話だけ。
- AIらしい丁寧さは避ける（${moodNote}で人間らしく）

${p.comprehensivePrompt ? `【補足】\n${p.comprehensivePrompt}` : ''}`
}
