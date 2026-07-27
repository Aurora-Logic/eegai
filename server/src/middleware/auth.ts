import type { Context, MiddlewareHandler, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { SESSION_COOKIE, verifySession, type SessionClaims } from '../lib/jwt.ts'

export type AppEnv = {
  Variables: {
    actor: SessionClaims | null
  }
}

/**
 * Attaches the caller's identity if their session cookie is valid. Never
 * rejects — that is `requireAuth`'s job — so public routes can stay public.
 */
export const withSession: MiddlewareHandler<AppEnv> = async (c, next: Next) => {
  const token = getCookie(c, SESSION_COOKIE)
  c.set('actor', token ? await verifySession(token) : null)
  await next()
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next: Next) => {
  if (!c.get('actor')) {
    return c.json({ error: 'Sign in to continue.' }, 401)
  }
  await next()
}

/**
 * Route-level role gate. RLS is still the real boundary — this just returns a
 * clean 403 instead of an empty result set.
 */
export function requireRole(...roles: SessionClaims['role'][]): MiddlewareHandler<AppEnv> {
  return async (c, next: Next) => {
    const actor = c.get('actor')
    if (!actor) return c.json({ error: 'Sign in to continue.' }, 401)
    if (!roles.includes(actor.role)) {
      return c.json({ error: 'This is not available for your account.' }, 403)
    }
    await next()
  }
}

export function actorOf(c: Context<AppEnv>): SessionClaims {
  const actor = c.get('actor')
  if (!actor) throw new Error('actorOf called on an unauthenticated request')
  return actor
}
