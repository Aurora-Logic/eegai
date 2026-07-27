import { Hono } from 'hono'
import { withActor } from '../lib/db.ts'
import { type AppEnv } from '../middleware/auth.ts'

export const legalRoutes = new Hono<AppEnv>()

/**
 * Privacy and terms, read by anyone.
 *
 * Deliberately no auth: someone deciding whether to hand over a phone number
 * has to be able to read the terms before they have an account. The RLS policy
 * says `using (true)` for the same reason.
 */
legalRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (slug !== 'privacy' && slug !== 'terms') {
    return c.json({ error: 'No such document.' }, 404)
  }

  // `c.get('actor')`, not actorOf() — actorOf throws when nobody is signed in,
  // and a signed-out visitor is exactly who this route is for. The policy is
  // `using (true)`, so a null actor still reads it.
  const row = await withActor(c.get('actor') ?? null, async (tx) => {
    const { rows } = await tx.query(
      'select slug, title, body, version, updated_at from public.legal_documents where slug = $1',
      [slug],
    )
    return rows[0] ?? null
  })

  if (!row) return c.json({ error: 'No such document.' }, 404)
  return c.json({ document: row })
})
