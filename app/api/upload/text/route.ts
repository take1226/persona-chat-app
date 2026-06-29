import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const personaId = formData.get('persona_id') as string
  const rawText = await file.text()

  const ref = await adminDb()
    .collection('personas').doc(personaId)
    .collection('uploads')
    .add({
      source_type: 'text',
      raw_text: rawText,
      ocr_confidence: 1.0,
      processed: false,
      created_at: Timestamp.now(),
    })

  return NextResponse.json({ success: true, id: ref.id })
}
