import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { parseLine } from '@/lib/ingest/parseLine'
import { normalize } from '@/lib/ingest/normalize'
import { buildTurns } from '@/lib/ingest/buildTurns'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const personaId = formData.get('persona_id') as string
  const rawText = await file.text()

  const db = adminDb()
  const personaDoc = await db.collection('personas').doc(personaId).get()
  const personaName = (personaDoc.data()?.name as string) ?? ''

  const msgs = normalize(parseLine(rawText, personaName))
  const turns = buildTurns(msgs)
  const turnsText = turns.map(t => `相手: ${t.user}\n${personaName}: ${t.persona}`).join('\n\n')

  const ref = await db.collection('personas').doc(personaId).collection('uploads').add({
    source_type: 'text',
    raw_text: rawText,
    normalized: JSON.stringify(msgs),
    turns: turnsText,
    turn_count: turns.length,
    ocr_confidence: 1.0,
    processed: false,
    created_at: Timestamp.now(),
  })

  return NextResponse.json({ success: true, id: ref.id, turn_count: turns.length })
}
