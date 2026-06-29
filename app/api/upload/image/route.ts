import { NextRequest, NextResponse } from 'next/server'
import { visionOCR } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { put } from '@vercel/blob'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const personaId = formData.get('persona_id') as string
  const sourceType = formData.get('source_type') as string

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const storagePath = `${personaId}/${Date.now()}_${file.name}`

  let publicUrl = ''
  try {
    const blob = await put(storagePath, buffer, { access: 'public', contentType: file.type })
    publicUrl = blob.url
  } catch (err) {
    console.error('Storage upload failed:', err)
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

  const ref = await adminDb()
    .collection('personas').doc(personaId)
    .collection('uploads')
    .add({
      source_type: sourceType,
      storage_path: storagePath,
      public_url: publicUrl,
      raw_text: rawText,
      ocr_confidence: confidence,
      processed: false,
      created_at: Timestamp.now(),
    })

  return NextResponse.json({ success: true, id: ref.id, extracted_text: rawText })
}
