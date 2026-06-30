import type { PersonaCard } from '@/lib/persona/card'

export const CHAT_CONTEXT_TURNS = 16

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function buildMessages(
  card: PersonaCard,
  recentHistory: ChatMessage[],
  turnExamples?: Array<{ user: string; persona: string }>,
): ChatMessage[] {
  // turnExamples が渡されていればそちらを優先（analyze-personality で抽出した高品質ペア）
  const exampleSource = (turnExamples && turnExamples.length > 0) ? turnExamples : card.examples
  const fewShot: ChatMessage[] = exampleSource.slice(0, 12).flatMap(ex => [
    { role: 'user' as const, content: ex.user },
    { role: 'assistant' as const, content: ex.persona },
  ])

  // 直近 CHAT_CONTEXT_TURNS ターン（送受信それぞれ1件で1ターンなので ×2）
  const recent = recentHistory.slice(-(CHAT_CONTEXT_TURNS * 2))

  return [...fewShot, ...recent]
}
