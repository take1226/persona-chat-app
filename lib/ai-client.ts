// SERVER-ONLY — クライアントコードから import しない
import { getAI, MODEL, VISION_MODEL } from './gemini'

function stripStopTokens(text: string): string {
  return (text ?? '')
    .replace(/<\|?\s*(?:end\s*of\s*text|endoftext|eot_id|im_end|im_start|eos|stop)\s*\|?>/gi, '')
    .replace(/<\/?s>/gi, '')
    .replace(/\[(?:END|EOS|DONE)\]/gi, '')
    .trim()
}

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
  try {
    const ai = getAI()
    const contents = [
      ...history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ]
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction: systemPrompt, maxOutputTokens: maxTokens },
    })
    return stripStopTokens(response.text ?? '')
  } catch (err) {
    console.error('[ai-client] chat error:', err)
    return ''
  }
}

export async function generate(prompt: string, maxTokens = 2000): Promise<string> {
  try {
    const ai = getAI()
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { maxOutputTokens: maxTokens },
    })
    return stripStopTokens(response.text ?? '')
  } catch (err) {
    console.error('[ai-client] generate error:', err)
    return ''
  }
}

export async function visionOCR(base64: string, mimeType: string): Promise<string> {
  try {
    const ai = getAI()
    const response = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: base64, mimeType } },
          {
            text: `このスクリーンショットはLINEまたはInstagramのDMのトーク画面です。
テキストメッセージをすべて抽出してください。

以下の形式のJSONのみ出力（前後の説明不要）:
{
  "messages": [
    { "sender": "相手" or "自分", "text": "メッセージ内容", "timestamp": "時刻（あれば）" }
  ],
  "confidence": 0.0〜1.0
}`,
          },
        ],
      }],
    })
    return response.text ?? ''
  } catch (err) {
    console.error('[ai-client] visionOCR error:', err)
    return ''
  }
}

export async function decideImageIndex(
  userMessage: string,
  images: { category: string; description: string }[],
): Promise<string> {
  const prompt = `今の会話の流れで画像を送るべきか判断してください。

【ユーザーのメッセージ】: ${userMessage}

【利用可能な画像】:
${images.map((img, i) => `${i}: category=${img.category}, description=${img.description}`).join('\n')}

画像を送るべきであれば番号(0〜${images.length - 1})を、送らなければ "none" を返してください。数字か "none" のみ。`

  try {
    const result = await generate(prompt, 10)
    return result.trim() || 'none'
  } catch {
    return 'none'
  }
}
