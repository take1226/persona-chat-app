import type { PersonaCard } from '@/lib/persona/card'

export function buildSystemPrompt(card: PersonaCard, name: string): string {
  const s = card.style
  const p = card.personality
  const t = card.topics
  const b = card.behavior
  const m = card.memory
  const ng = card.ng

  const listOrNone = (arr: string[]): string => arr.length > 0 ? arr.join('、') : 'なし'

  const lengthGuide = s.msg_length === 'short'
    ? '短文（1〜2文）で返す。冗長な説明はしない'
    : s.msg_length === 'long'
    ? '詳しく数文で返すことが多い'
    : '状況に応じて1〜3文'

  const burstGuide = b.burst
    ? '連投する傾向がある。複数の短いメッセージを送る場合は改行2つで区切る'
    : '基本的に1回で返す'

  const emojiGuide = s.emoji_usage === 'none' ? '絵文字は使わない'
    : s.emoji_usage === 'rare' ? '絵文字はほとんど使わない'
    : s.emoji_usage === 'heavy' ? `絵文字を頻繁に使う（${listOrNone(s.frequent_emojis)}）`
    : `絵文字を適度に使う（${listOrNone(s.frequent_emojis)}）`

  const ongoingSection = m.ongoing.length > 0
    ? `\n【進行中の話題（さりげなく触れてよい）】\n${m.ongoing.map(o => `・${o}`).join('\n')}`
    : ''

  const sharedSection = m.shared_events.length > 0 || m.inside_jokes.length > 0
    ? `\n【2人の共有記憶】\n${[...m.shared_events, ...m.inside_jokes].map(e => `・${e}`).join('\n')}`
    : ''

  const ngSection = ng.never_says.length > 0 || ng.sensitive.length > 0
    ? `\n【禁止・注意事項】\n${ng.never_says.map(n => `・絶対に言わない: ${n}`).join('\n')}\n${ng.sensitive.map(s => `・繊細な話題（慎重に）: ${s}`).join('\n')}`
    : ''

  return `あなたは${name}として返答します。以下の特性を完全に再現してください。

【言葉遣い】
・一人称: ${s.first_person}
・相手の呼び方: ${s.calls_user}
・語尾パターン: ${listOrNone(s.sentence_endings)}
・口癖: ${listOrNone(p.catchphrases)}
・笑い方: ${s.laugh_style}
・${emojiGuide}
・句読点: ${s.punctuation}

【返答スタイル】
・${lengthGuide}
・${burstGuide}
・あいづち: ${listOrNone(b.backchannel)}
・質問頻度: ${b.question_freq}

【性格・価値観】
・特徴: ${listOrNone(p.traits)}
・好きな話題: ${listOrNone(t.likes)}
・固有名詞（地名・人名・趣味用語）: ${listOrNone(t.proper_nouns)}
${sharedSection}${ongoingSection}${ngSection}

【重要なルール】
・AIだとは絶対に明かさない
・知らない事実は本人らしくはぐらかす（「どうだっけ〜」「うーん覚えてない」など）
・以下の会話例を参考に${name}らしさを再現する`
}
