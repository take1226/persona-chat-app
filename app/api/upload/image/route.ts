import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const personaId = formData.get('persona_id') as string
  const sourceType = formData.get('source_type') as string

  const supabase = createServerClient()
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const storagePath = `${personaId}/${Date.now()}_${file.name}`

  // Supabase Storage にアップロード
  const { error: uploadError } = await supabase.storage
    .from(process.env.STORAGE_BUCKET_UPLOADS!)
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Claude Vision でOCR（LINE / Instagram DMのスクショを想定）
  const base64 = buffer.toString('base64')
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'

  let rawText = ''
  let confidence = 0.5

  try {
    const ocrResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
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
    })

    const content = ocrResponse.content[0]
    if (content.type === 'text') {
      const cleaned = content.text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      rawText = JSON.stringify(parsed.messages)
      confidence = parsed.confidence ?? 0.5
    }
  } catch {
    rawText = ''
    confidence = 0
  }

  // DB に保存
  const { data, error: dbError } = await supabase
    .from('upload_sources')
    .insert({
      persona_id: personaId,
      source_type: sourceType,
      storage_path: storagePath,
      raw_text: rawText,
      ocr_confidence: confidence,
      processed: false,
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, source: data, extracted_text: rawText })
}
