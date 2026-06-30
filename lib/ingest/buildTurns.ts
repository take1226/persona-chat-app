import type { NormalizedMessage, TurnPair } from './types'

export function buildTurns(msgs: NormalizedMessage[]): TurnPair[] {
  const pairs: TurnPair[] = []

  let i = 0
  while (i < msgs.length) {
    // user 側の発話を収集
    const userLines: string[] = []
    while (i < msgs.length && msgs[i].speaker === 'user' && msgs[i].type === 'text') {
      userLines.push(msgs[i].text)
      i++
    }

    // persona 側の返答を収集
    const personaLines: string[] = []
    while (i < msgs.length && msgs[i].speaker === 'persona' && msgs[i].type === 'text') {
      personaLines.push(msgs[i].text)
      i++
    }

    if (userLines.length > 0 && personaLines.length > 0) {
      pairs.push({
        user: userLines.join('\n'),
        persona: personaLines.join('\n'),
      })
    } else if (userLines.length === 0 && personaLines.length > 0) {
      // persona が先に話す場合（自発）はスキップ
      // 次の user 発話に繋げるため i はそのまま進む
    } else if (userLines.length > 0 && personaLines.length === 0) {
      // user の発話に persona が返さなかったケース（会話途切れ）はスキップ
    } else {
      // どちらも空（sticker/image 等）は 1 つ進める
      i++
    }
  }

  return pairs
}
