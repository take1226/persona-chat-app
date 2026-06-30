// SERVER-ONLY — クライアントコードから import しない
import { getAI, MODEL, VISION_MODEL } from './gemini'

function stripStopTokens(text: string): string {
  return (text ?? '')
    .replace(/<\|?\s*(?:end\s*of\s*text|endoftext|eot_id|im_end|im_start|eos|stop)\s*\|?>/gi, '')
    .replace(/<\/?s>/gi, '')
    .replace(/\[(?:END|EOS|DONE)\]/gi, '')
    .trim()
}

// タイムアウト付き Promise ラッパー（外部でも使用可能）
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms)),
  ])
}

// AI が返したテキストが「エラー・待機の定型文」かどうかを判定
function looksLikeSuspiciousResponse(text: string): boolean {
  if (!text || text.trim().length < 2) return true
  const patterns = [
    /ちょっと待って/, /少々お待ち/, /しばらくお待ち/, /please wait/i,
    /rate.?limit/i, /too many requests/i, /try again/i, /一時的に/, /混雑/,
    /申し訳ありません.*しばらく/, /サービスが/, /エラーが発生/,
  ]
  return patterns.some(p => p.test(text))
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

// 怪しいレスポンスを弾いて最大2回リトライする
export async function chatWithRetry(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  maxTokens = 500,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await chat(systemPrompt, history, userMessage, maxTokens)
      if (!looksLikeSuspiciousResponse(text)) return text
      console.warn('[ai-client] suspicious response on attempt', attempt + 1, ':', text.slice(0, 50))
    } catch { /* fallthrough */ }
    if (attempt === 0) await new Promise(r => setTimeout(r, 2000))
  }
  return ''
}

export async function reactToImage(
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
  caption: string,
): Promise<string> {
  try {
    const ai = getAI()
    const captionLine = caption ? `\n\nキャプション: ${caption}` : ''
    const response = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          {
            text: `${systemPrompt}\n\n---\n送られてきた写真を見て、自分として自然に反応してください。写真の内容を感じ取り、友人・恋人としての距離感で、感想・驚き・ツッコミ・質問など人間味のある短い反応を1〜2文で返してください。説明的・分析的な物言いは避けてください。${captionLine}`,
          },
        ],
      }],
      config: { maxOutputTokens: 150 },
    })
    return stripStopTokens(response.text ?? '')
  } catch (err) {
    console.error('[ai-client] reactToImage error:', err)
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
