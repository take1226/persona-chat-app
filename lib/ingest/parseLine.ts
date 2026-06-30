import type { NormalizedMessage, Speaker } from './types'

const SYSTEM_PATTERNS = [
  /^通話時間/,
  /^メッセージの送信を取り消しました/,
  /^LINEスタンプを購入しました/,
  /^\[通話\]/,
]

const STICKER_PATTERNS = [/^\[スタンプ\]$/, /^スタンプ$/]
const IMAGE_PATTERNS = [/^\[写真\]$/, /^\[動画\]$/, /^写真$/, /^動画$/]

function classifyText(text: string): NormalizedMessage['type'] {
  if (SYSTEM_PATTERNS.some(p => p.test(text))) return 'system'
  if (STICKER_PATTERNS.some(p => p.test(text))) return 'sticker'
  if (IMAGE_PATTERNS.some(p => p.test(text))) return 'image'
  return 'text'
}

function normalizeSender(sender: string, personaName: string): Speaker {
  const s = sender.trim()
  if (s === '自分' || s === 'You' || s === 'me') return 'user'
  if (s === personaName) return 'persona'
  // 「相手」は persona
  if (s === '相手') return 'persona'
  // それ以外は user（グループチャットなど）
  return 'user'
}

export function parseLine(raw: string, personaName: string): NormalizedMessage[] {
  const lines = raw.split('\n')
  const results: NormalizedMessage[] = []
  let currentDate = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 日付見出し行 (例: 2024/01/15(月) or 2024年1月15日(月))
    if (/^\d{4}[\/年]\d{1,2}[\/月]\d{1,2}/.test(trimmed)) {
      currentDate = trimmed.split(/[（(]/)[0].trim()
      continue
    }

    // タブ区切り形式: HH:MM\t送信者\t本文
    const tabParts = trimmed.split('\t')
    if (tabParts.length >= 3) {
      const [timeStr, sender, ...bodyParts] = tabParts
      const text = bodyParts.join('\t').trim()
      if (!text) continue
      const ts = `${currentDate} ${timeStr}`.trim()
      const speaker = normalizeSender(sender, personaName)
      const type = classifyText(text)
      results.push({ ts, speaker, text, type, rawSource: 'LINE' })
      continue
    }

    // スペース区切り形式: 午後H:MM 送信者 本文（旧LINE形式）
    const spaceParts = trimmed.match(/^(午前|午後)?(\d{1,2}:\d{2})\s+(.+?)\s+(.+)$/)
    if (spaceParts) {
      const [, ampm, time, sender, text] = spaceParts
      let hour = parseInt(time.split(':')[0])
      if (ampm === '午後' && hour < 12) hour += 12
      const ts = `${currentDate} ${String(hour).padStart(2, '0')}:${time.split(':')[1]}`.trim()
      const speaker = normalizeSender(sender, personaName)
      const type = classifyText(text)
      results.push({ ts, speaker, text, type, rawSource: 'LINE' })
    }
  }

  return results
}
