import type { PersonaCard } from '@/lib/persona/card'

export const CHAT_CONTEXT_TURNS = 16

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function buildMessages(
  card: PersonaCard,
  recentHistory: ChatMessage[],
): ChatMessage[] {
  // few-shot: card.examples を実際の会話ターンとして差し込む
  const fewShot: ChatMessage[] = card.examples.slice(0, 10).flatMap(ex => [
    { role: 'user' as const, content: ex.user },
    { role: 'assistant' as const, content: ex.persona },
  ])

  // 直近 CHAT_CONTEXT_TURNS ターン（送受信それぞれ1件で1ターンなので ×2）
  const recent = recentHistory.slice(-(CHAT_CONTEXT_TURNS * 2))

  return [...fewShot, ...recent]
}
