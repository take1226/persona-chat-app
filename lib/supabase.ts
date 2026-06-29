import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseClient: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ?? 'undefined')
      console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '***' : 'undefined')
      throw new Error('Supabase environment variables not configured. Check .env.local')
    }
    _supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return _supabaseClient
}

export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getClient()
    const val = Reflect.get(client, prop, client)
    return typeof val === 'function' ? (val as Function).bind(client) : val
  },
})

export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment')
  }
  return createClient(supabaseUrl, serviceRoleKey)
}
