import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseClient: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_supabaseClient) {
    _supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabaseClient
}

// クライアント側（ブラウザから使用）— Proxy で遅延初期化
export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getClient()
    const val = Reflect.get(client, prop, client)
    return typeof val === 'function' ? (val as Function).bind(client) : val
  },
})

// サーバー側（APIルートから使用 / Service Role）
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
