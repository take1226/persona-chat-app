import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { emptyCard } from '@/lib/persona/card'

export async function POST(req: NextRequest) {
  try {
    const { profile, nickname } = await req.json()
    if (!profile?.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const now = Timestamp.now()
    const ref = await adminDb().collection('personas').add({
      name: profile.name,
      nickname: nickname ?? '',
      profile,
      system_prompt: `あなたは${profile.name}として自然に振る舞ってください。`,
      card: emptyCard(),
      raw_analysis: {},
      auto_message_enabled: true,
      auto_message_interval_hours_min: 12,
      auto_message_interval_hours_max: 24,
      last_auto_message_at: null,
      created_at: now,
      updated_at: now,
    })

    return NextResponse.json({ persona_id: ref.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('Persona init error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
