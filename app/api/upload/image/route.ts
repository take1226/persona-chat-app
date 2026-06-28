import { NextRequest, NextResponse } from 'next/server'
import { visionOCR } from '@/lib/ai-client'
import { createServerClient } from '@/lib/supabase'

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

  const base64 = buffer.toString('base64')

  let rawText = ''
  let confidence = 0.5

  try {
    const content = await visionOCR(base64, file.type)
    const cleaned = content.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    rawText = JSON.stringify(parsed.messages)
    confidence = parsed.confidence ?? 0.5
  } catch {
    rawText = ''
    confidence = 0
  }

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
