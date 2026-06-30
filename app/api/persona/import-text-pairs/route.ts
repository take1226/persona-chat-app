import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

type Msg = { speaker: 'user' | 'persona'; text: string }

function parsePairs(
  rawText: string,
  personaName: string,
): Array<{ user: string; persona: string }> {
  const lines = rawText.split('\n')
  const msgs: Msg[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const tabParts = line.split('\t')

    // LINE export format: "HH:MM\tname\tmessage" (3+ tab fields)
    if (tabParts.length >= 3) {
      const name = tabParts[1].trim()
      const text = tabParts.slice(2).join('\t').trim()
      if (!text) continue
      msgs.push({ speaker: name === personaName ? 'persona' : 'user', text })
      continue
    }

    // "name\tmessage" (2 tab fields)
    if (tabParts.length === 2) {
      const name = tabParts[0].trim()
      const text = tabParts[1].trim()
      if (!text) continue
      msgs.push({ speaker: name === personaName ? 'persona' : 'user', text })
      continue
    }

    // "name: message" format
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < 20) {
      const name = line.slice(0, colonIdx).trim()
      const text = line.slice(colonIdx + 1).trim()
      if (!text) continue
      msgs.push({ speaker: name === personaName ? 'persona' : 'user', text })
    }
    // Lines that match none of the above are silently skipped
  }

  // Group: consecutive user turns → next consecutive persona turns = 1 pair
  const pairs: Array<{ user: string; persona: string }> = []
  let i = 0
  while (i < msgs.length) {
    if (msgs[i].speaker !== 'user') { i++; continue }

    const userParts: string[] = []
    while (i < msgs.length && msgs[i].speaker === 'user') {
      userParts.push(msgs[i].text)
      i++
    }
    if (i >= msgs.length || msgs[i].speaker !== 'persona') continue

    const personaParts: string[] = []
    while (i < msgs.length && msgs[i].speaker === 'persona') {
      personaParts.push(msgs[i].text)
      i++
    }

    pairs.push({
      user: userParts.join('\n'),
      persona: personaParts.join('\n'),
    })
  }

  return pairs
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { persona_id?: string; raw_text?: string }
    const { persona_id, raw_text } = body

    if (!persona_id || !raw_text) {
      return NextResponse.json({ error: 'persona_id and raw_text required' }, { status: 400 })
    }

    const db = adminDb()
    const personaDoc = await db.collection('personas').doc(persona_id).get()
    if (!personaDoc.exists) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }
    const personaName = (personaDoc.data()?.name as string) ?? ''

    const pairs = parsePairs(raw_text, personaName)
    if (pairs.length === 0) {
      return NextResponse.json({ success: true, importedCount: 0 })
    }

    const colRef = db.collection('personas').doc(persona_id).collection('turn_examples')
    for (let i = 0; i < pairs.length; i += 499) {
      const batch = db.batch()
      for (const pair of pairs.slice(i, i + 499)) {
        batch.set(colRef.doc(), { ...pair, source: 'pasted_text', created_at: Timestamp.now() })
      }
      await batch.commit()
    }

    return NextResponse.json({ success: true, importedCount: pairs.length })
  } catch (err) {
    console.error('[import-text-pairs] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
