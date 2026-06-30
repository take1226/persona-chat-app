export type Speaker = 'persona' | 'user'

export interface NormalizedMessage {
  ts: string
  speaker: Speaker
  text: string
  type: 'text' | 'sticker' | 'image' | 'system'
  rawSource: 'LINE' | 'IG' | 'OCR'
}

export interface TurnPair {
  user: string
  persona: string
}
