import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

function buildInitialPrompt(profile: { name: string; relationship?: string; gender?: string; remarks?: string }) {
  const lines = [`あなたは${profile.name}として自然に振る舞ってください。`]
  if (profile.relationship) lines.push(`関係性: ${profile.relationship}`)
  if (profile.gender) lines.push(`性別: ${profile.gender}`)
  if (profile.remarks) lines.push(`特徴: ${profile.remarks}`)
  lines.push('相手のメッセージに対して、その人らしい自然な返答を短めにしてください。')
  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await req.json()
    if (!profile?.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const now = Timestamp.now()
    const ref = await adminDb().collection('personas').add({
      name: profile.name,
      profile,
      system_prompt: buildInitialPrompt(profile),
      raw_analysis: {},
      auto_message_enabled: true,
      auto_message_interval_min: 5,
      auto_message_interval_max: 30,
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
