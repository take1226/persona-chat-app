import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const personaId = formData.get('persona_id') as string

  const supabase = createServerClient()
  const rawText = await file.text()

  const { data, error } = await supabase
    .from('upload_sources')
    .insert({
      persona_id: personaId,
      source_type: 'text',
      raw_text: rawText,
      ocr_confidence: 1.0,
      processed: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, source: data })
}
