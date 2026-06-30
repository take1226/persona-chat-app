import type { NormalizedMessage } from './types'

export function normalize(msgs: NormalizedMessage[]): NormalizedMessage[] {
  // システムメッセージを除外
  const filtered = msgs.filter(m => m.type !== 'system')

  // 連続する同一 speaker の発話を集約
  const merged: NormalizedMessage[] = []
  for (const msg of filtered) {
    const last = merged[merged.length - 1]
    if (last && last.speaker === msg.speaker && last.type === 'text' && msg.type === 'text') {
      last.text += '\n' + msg.text
    } else {
      merged.push({ ...msg })
    }
  }

  return merged
}
