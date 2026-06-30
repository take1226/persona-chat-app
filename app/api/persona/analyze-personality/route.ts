import { NextRequest, NextResponse } from 'next/server'
import { generate } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { validatePersonaCard, type PersonaCard } from '@/lib/persona/card'

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

    const personaName = (personaDoc.data()?.name as string) ?? '対象者'

    // ターンペアを優先、なければ raw_text を使用
    const turns: string[] = []
    const rawTexts: string[] = []
    for (const d of uploadsSnap.docs) {
      const data = d.data() as { turns?: string; raw_text?: string }
      if (data.turns) turns.push(data.turns)
      else if (data.raw_text && data.raw_text !== '[OCR未取得]' && data.raw_text !== '[画像のみ]') {
        rawTexts.push(data.raw_text)
      }
    }

    const inputText = turns.length > 0
      ? `【会話ターンペア（相手発話→本人返答）】\n${turns.join('\n---\n')}`
      : rawTexts.join('\n---\n')

    if (!inputText.trim()) {
      return NextResponse.json(
        { error: 'No valid text', message: 'スクショ/テキストがまだアップロードされていません' },
        { status: 400 }
      )
    }

    const prompt = `以下は「${personaName}」さんのトーク履歴データです。
このデータから、${personaName}さんを完全に模倣するための「ペルソナカード」を作成してください。

【データ】
${inputText.substring(0, 6000)}

【出力形式】以下のJSONのみ。前置き・コードフェンス（\`\`\`）は禁止。
{
  "style": {
    "first_person": "一人称（俺/私/僕/うち 等）",
    "calls_user": "相手への呼び方（君/あなた/名前 等）",
    "sentence_endings": ["語尾パターン（〜だよ/〜じゃん/〜w 等）"],
    "kanji_ratio": "low|medium|high",
    "emoji_usage": "none|rare|moderate|heavy",
    "frequent_emojis": ["よく使う絵文字"],
    "laugh_style": "笑い方（w/ww/笑/ｗ 等）",
    "punctuation": "句読点の使い方（なし/少し/普通 等）",
    "msg_length": "short|medium|long"
  },
  "personality": {
    "traits": ["性格特徴"],
    "values": ["大切にしていること"],
    "catchphrases": ["口癖・決まり文句"]
  },
  "topics": {
    "likes": ["好きな話題・趣味"],
    "dislikes": ["苦手・嫌いな話題"],
    "proper_nouns": ["固有名詞（地名・人名・作品名・趣味の用語 等）"]
  },
  "behavior": {
    "reply_tempo": "fast|normal|slow",
    "burst": true（連投する）またはfalse,
    "question_freq": "low|medium|high",
    "backchannel": ["あいづち表現（うん/そうだね/なるほど 等）"]
  },
  "memory": {
    "shared_events": ["2人で共有した体験・出来事"],
    "inside_jokes": ["内輪ネタ・2人だけの言葉"],
    "ongoing": ["進行中の話題・気になっていること"]
  },
  "ng": {
    "never_says": ["絶対に使わない言葉・表現"],
    "sensitive": ["触れないほうがいい話題"]
  },
  "examples": [
    {"user": "相手の発話", "persona": "${personaName}さんの返答"},
    ...（本人らしさが強い実際の会話から10〜20件）
  ],
  "meta": {
    "source": "LINE|Instagram|その他",
    "period": "会話の期間（例: 2024年）",
    "message_count": メッセージ総数（数値）,
    "confidence": 0.0〜1.0
  }
}`

    const raw = await generate(prompt, 3000)
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)

    let card: PersonaCard
    try {
      card = validatePersonaCard(jsonMatch ? JSON.parse(jsonMatch[0]) : null)
    } catch {
      card = validatePersonaCard(null)
    }

    await db.collection('personas').doc(persona_id).update({
      card,
      raw_analysis: card,
      updated_at: Timestamp.now(),
    })

    return NextResponse.json({ success: true, card })
  } catch (err: unknown) {
    const error = err as { message?: string }
    console.error('[analyze-personality] error:', error)
    return NextResponse.json({ error: error?.message ?? 'Internal error' }, { status: 500 })
  }
}
