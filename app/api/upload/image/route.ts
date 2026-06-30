import { NextRequest, NextResponse } from 'next/server'
import { visionOCR } from '@/lib/ai-client'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { put } from '@vercel/blob'
import { normalize } from '@/lib/ingest/normalize'
import { buildTurns } from '@/lib/ingest/buildTurns'
import type { NormalizedMessage } from '@/lib/ingest/types'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const personaId = formData.get('persona_id') as string
    const sourceType = (formData.get('source_type') as string) || 'screenshot'

    if (!file || !personaId) {
      return NextResponse.json({ success: false, error: 'Missing file or persona_id' }, { status: 400 })
    }

    const db = adminDb()
    const personaDoc = await db.collection('personas').doc(personaId).get()
    const personaName = (personaDoc.data()?.name as string) ?? '相手'

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
    let turnsText = ''
    let turnCount = 0

    try {
      const content = await visionOCR(base64, file.type)
      const cleaned = content.replace(/```json|```/g, '').trim()

      interface OcrMessage { sender: string; text: string; timestamp?: string }
      interface OcrResult { messages?: OcrMessage[]; confidence?: number }

      let parsed: OcrResult = {}
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        rawText = cleaned
        confidence = 0.4
      }

      if (parsed.messages) {
        const ocrMsgs = parsed.messages
        confidence = parsed.confidence ?? 0.5

        // OCR の sender ("相手"/"自分") → NormalizedMessage
        const normalized: NormalizedMessage[] = ocrMsgs.map(m => ({
          ts: m.timestamp ?? '',
          speaker: (m.sender === personaName || m.sender === '相手') ? 'persona' : 'user',
          text: m.text,
          type: 'text' as const,
          rawSource: 'OCR' as const,
        }))

        rawText = JSON.stringify(ocrMsgs)
        const turns = buildTurns(normalize(normalized))
        turnsText = turns.map(t => `相手: ${t.user}\n${personaName}: ${t.persona}`).join('\n\n')
        turnCount = turns.length
      }
    } catch (err) {
      console.warn('OCR failed (continuing):', err)
      rawText = `[OCR未取得] ${file.name}`
      confidence = 0
    }

    let docId = ''
    try {
      const ref = await db.collection('personas').doc(personaId).collection('uploads').add({
        source_type: sourceType,
        storage_path: storagePath,
        public_url: publicUrl,
        raw_text: rawText || '[画像のみ]',
        turns: turnsText,
        turn_count: turnCount,
        ocr_confidence: confidence,
        processed: false,
        created_at: Timestamp.now(),
      })
      docId = ref.id
    } catch (err) {
      console.warn('Firestore write failed (continuing):', err)
    }

    return NextResponse.json({ success: true, id: docId, extracted_text: rawText, turn_count: turnCount })
  } catch (err) {
    console.error('upload/image unexpected error:', err)
    return NextResponse.json({ success: false, error: 'Internal error' })
  }
}
