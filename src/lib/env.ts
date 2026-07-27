import { z } from 'zod'

/**
 * Anything reachable here is in the client bundle by definition. The Supabase
 * anon key belongs (it is public and RLS-gated); a service-role key never does.
 * Privileged work goes in an Edge Function — PLAN.md §3.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a full URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'VITE_SUPABASE_ANON_KEY is required'),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

/**
 * Validated lazily rather than at import time, so that routes which never touch
 * Supabase (the style guide, the offline shell) still render on a machine with
 * no .env.local. The failure is loud at first use, not silent.
 */
export function loadEnv(): Env {
  if (cached) return cached

  const parsed = envSchema.safeParse(import.meta.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.message).join('\n  ')
    throw new Error(`Environment is not configured. Copy .env.example to .env.local.\n  ${missing}`)
  }

  cached = parsed.data
  return cached
}

export function isConfigured(): boolean {
  return envSchema.safeParse(import.meta.env).success
}
