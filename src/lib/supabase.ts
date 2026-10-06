import { createClient, type User } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})


/**
 * Signed-in user from the locally stored session. Unlike auth.getUser(), this makes no
 * Auth-server round trip (only a token refresh when the access token has expired), so
 * it's what navigation and query helpers use. Safe for scoping queries: RLS validates
 * the JWT on every request. Use auth.getUser() only where server-verified user data
 * (e.g. fresh email confirmation state) is needed.
 */
export async function getSessionUser(): Promise<User | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user ?? null
}
