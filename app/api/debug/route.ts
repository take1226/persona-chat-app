import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  const isValidUrl = (s: string) => { try { new URL(s); return true } catch { return false } }

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: {
      set: url.length > 0,
      valid_url: isValidUrl(url),
      prefix: url.length > 0 ? url.substring(0, 12) + '...' : '(empty)',
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      set: anonKey.length > 0,
      prefix: anonKey.length > 0 ? anonKey.substring(0, 8) + '...' : '(empty)',
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      set: serviceKey.length > 0,
      prefix: serviceKey.length > 0 ? serviceKey.substring(0, 8) + '...' : '(empty)',
    },
  })
}
