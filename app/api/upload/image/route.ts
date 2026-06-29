import { NextRequest, NextResponse } from 'next/server'
import { visionOCR } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { put } from '@vercel/blob'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const personaId = formData.get('persona_id') as string
    const sourceType = (formData.get('source_type') as string) || 'screenshot'

    if (!file || !personaId) {
      return NextResponse.json({ success: false, error: 'Missing file or persona_id' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const storagePath = `${personaId}/${Date.now()}_${file.name}`

    let publicUrl = ''
    try {
      const blob = await put(storagePath, buffer, { access: 'public', contentType: file.type })
      publicUrl = blob.url
    } catch (err) {
      console.warn('Blob upload failed (continuing):', err)
    }

    const base64 = buffer.toString('base64')
    let rawText = ''
    let confidence = 0

    try {
      const content = await visionOCR(base64, file.type)
      const cleaned = content.replace(/```json|```/g, '').trim()
      try {
        const parsed = JSON.parse(cleaned)
        rawText = JSON.stringify(parsed.messages ?? parsed)
        confidence = parsed.confidence ?? 0.5
      } catch {
        rawText = cleaned
        confidence = 0.4
      }
    } catch (err) {
      console.warn('OCR failed (continuing):', err)
      rawText = `[OCR未取得] ${file.name}`
      confidence = 0
    }

    let docId = ''
    try {
      const ref = await adminDb()
        .collection('personas').doc(personaId)
        .collection('uploads')
        .add({
          source_type: sourceType,
          storage_path: storagePath,
          public_url: publicUrl,
          raw_text: rawText || '[画像のみ]',
          ocr_confidence: confidence,
          processed: false,
          created_at: Timestamp.now(),
        })
      docId = ref.id
    } catch (err) {
      console.warn('Firestore write failed (continuing):', err)
    }

    return NextResponse.json({ success: true, id: docId, extracted_text: rawText })
  } catch (err) {
    console.error('upload/image unexpected error:', err)
    return NextResponse.json({ success: false, error: 'Internal error' })
  }
}
