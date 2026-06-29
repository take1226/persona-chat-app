import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { profile } = await req.json()

    if (!profile?.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('personas')
      .insert({
        name: profile.name,
        profile,
        auto_message_enabled: true,
        auto_message_interval_min: 5,
        auto_message_interval_max: 30,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 })
    }

    return NextResponse.json({ persona_id: data.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('Persona init error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
