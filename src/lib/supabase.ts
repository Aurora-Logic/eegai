import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { loadEnv } from './env'

let client: SupabaseClient<Database> | null = null

/**
 * The one Supabase client for the app. Always go through this — calling
 * createClient anywhere else splits the auth session across instances.
 *
 * Constructed on first use rather than at module load so that importing
 * anything from this file does not require a configured environment.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client

  const env = loadEnv()
  client = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Phone OTP is the only entry point (PLAN.md §3), so there is no OAuth
      // redirect to parse out of the URL.
      detectSessionInUrl: false,
    },
  })

  return client
}

/** Test seam — drops the memoised client so a suite can swap the environment. */
export function resetSupabase(): void {
  client = null
}
