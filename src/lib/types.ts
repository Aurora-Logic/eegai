/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Regenerate with:  npm run db:types
 * (which runs `supabase gen types typescript --local` against the local stack)
 *
 * ---------------------------------------------------------------------------
 * PLACEHOLDER. This file has not been generated yet because generating it
 * requires a running local Postgres, which requires Docker — not installed on
 * the machine this was scaffolded on. The M0 migrations exist and are correct;
 * the first person with Docker available must run:
 *
 *     npx supabase start && npm run db:types
 *
 * and commit the result. Until then `Database` is deliberately unconstrained so
 * the app compiles, and no query in the codebase is type-checked against the
 * real schema. See NOTES.md.
 * ---------------------------------------------------------------------------
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
