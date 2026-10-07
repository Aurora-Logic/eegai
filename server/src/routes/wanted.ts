import { Hono } from 'hono'
import { z } from 'zod'
import { withActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'
import { CATEGORIES } from '../../../src/lib/validation/donation.ts'

/**
 * What an organisation needs — the other direction of the goods wall.
 *
 * Until now an NGO could only wait for whatever a donor happened to post. This
 * is the sentence it could not say: "we need 40 school bags in June". A donor
 * reads it and posts against it; nothing is reserved, promised or matched
 * automatically, because the wall's first-claim rule already decides who gets
 * what and a second mechanism on top would only disagree with it.
 */
export const wantedRoutes = new Hono<AppEnv>()

// Signed in for all of it: a donor has to be able to read what is needed, and
// actorOf throws on an anonymous request rather than answering 401 by itself.
wantedRoutes.use('*', requireAuth)

const postSchema = z.object({
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
  title: z.string().trim().min(3, 'Say what you need').max(120),
  quantity: z.coerce.number().int().min(1).max(10000).default(1),
  note: z.string().trim().max(500).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(180).default(30),
})

const EXPECTED = /only an organisation|not verified|hospital asks|say what you need|not yours/i

function asClientError(error: unknown) {
  const raw = error instanceof Error ? error.message : ''
  return EXPECTED.test(raw) ? raw.replace(/^.*?:\s*/, '') : null
}

/** Everything open, newest first. Visible to anyone signed in. */
wantedRoutes.get('/', async (c) => {
  const actor = actorOf(c)
  const requests = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select id, organisation_name, category::text as category, title, quantity, note,
              pincode, status, created_at, expires_at
       from public.material_requests
       where status = 'open' and expires_at > now()
       order by created_at desc
       limit 100`,
    )
    return rows
  })
  return c.json({ requests })
})

/** The caller organisation's own, open or not. */
wantedRoutes.get('/mine', async (c) => {
  const actor = actorOf(c)
  const requests = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select mr.id, mr.organisation_name, mr.category::text as category, mr.title, mr.quantity,
              mr.note, mr.pincode, mr.status, mr.created_at, mr.expires_at, mr.closed_at
       from public.material_requests mr
       join public.ngos n on n.id = mr.ngo_id
       join public.profiles p on p.id = n.profile_id
       where p.user_id = app.current_user_id()
       order by mr.created_at desc
       limit 100`,
    )
    return rows
  })
  return c.json({ requests })
})

wantedRoutes.post('/', async (c) => {
  const actor = actorOf(c)
  const parsed = postSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }
  const p = parsed.data

  try {
    const id = await withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        `select app.post_material_request(
           $1::public.donation_category, $2, $3, $4, $5) as id`,
        [p.category, p.title, p.quantity, p.note ?? null, p.expiresInDays],
      )
      return rows[0]?.id as string
    })
    log.info('material request posted', { requestId: c.get('requestId') })
    return c.json({ id }, 201)
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 409)
    throw error
  }
})

wantedRoutes.post('/:id/close', async (c) => {
  const actor = actorOf(c)
  const status = (await c.req.json().catch(() => null))?.status
  if (!['fulfilled', 'closed', 'cancelled'].includes(status)) {
    return c.json({ error: 'Close it as fulfilled, closed or cancelled.' }, 400)
  }

  try {
    const ok = await withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        'select app.close_material_request($1, $2::public.health_request_status) as ok',
        [c.req.param('id'), status],
      )
      return rows[0]?.ok === true
    })
    if (!ok) return c.json({ error: 'That one is no longer open.' }, 409)
    return c.json({ ok: true })
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 403)
    throw error
  }
})
