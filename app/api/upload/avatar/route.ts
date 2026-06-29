import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const personaId = formData.get('persona_id') as string

    if (!file || !personaId) {
      return NextResponse.json({ error: 'Missing file or persona_id' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const storagePath = `${personaId}/avatar_${Date.now()}_${file.name}`

    const blob = await put(storagePath, buffer, { access: 'public', contentType: file.type })

    await adminDb().collection('personas').doc(personaId).update({
      avatar_url: blob.url,
      updated_at: Timestamp.now(),
    })

    return NextResponse.json({ success: true, public_url: blob.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
