const POLLINATIONS_URL = 'https://text.pollinations.ai/openai'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function chat(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  maxTokens = 500,
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ]
  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai', messages, max_tokens: maxTokens, private: true }),
  })
  if (!res.ok) throw new Error(`AI API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export async function decideImageIndex(userMessage: string, images: { category: string; description: string }[]): Promise<string> {
  const prompt = `今の会話の流れで画像を送るべきか判断してください。

【ユーザーのメッセージ】: ${userMessage}

【利用可能な画像】:
${images.map((img, i) => `${i}: category=${img.category}, description=${img.description}`).join('\n')}

画像を送るべきであれば番号(0〜${images.length - 1})を、送らなければ "none" を返してください。数字か "none" のみ。`

  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      private: true,
    }),
  })
  if (!res.ok) return 'none'
  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? 'none').trim()
}

export async function generate(prompt: string, maxTokens = 2000): Promise<string> {
  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      private: true,
    }),
  })
  if (!res.ok) throw new Error(`AI API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export async function visionOCR(base64: string, mimeType: string): Promise<string> {
  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          {
            type: 'text',
            text: `このスクリーンショットはLINEまたはInstagramのDMのトーク画面です。
テキストメッセージをすべて抽出してください。

以下の形式のJSONのみ出力してください（前後の説明不要）:
{
  "messages": [
    { "sender": "相手" or "自分", "text": "メッセージ内容", "timestamp": "時刻（あれば）" }
  ],
  "confidence": 0.0〜1.0
}`,
          },
        ],
      }],
      max_tokens: 1000,
      private: true,
    }),
  })
  if (!res.ok) throw new Error(`Vision API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}
