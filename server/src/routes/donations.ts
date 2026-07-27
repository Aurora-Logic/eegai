import { Hono } from 'hono'
import { donationDraftSchema } from '../../../src/lib/validation/donation.ts'
import { transition, IllegalTransitionError } from '../../../src/lib/state-machine.ts'
import type { DonationStatus } from '../../../src/lib/validation/donation.ts'
import { withActor, withSystemActor } from '../lib/db.ts'
import { actorOf, requireAuth, requireRole, type AppEnv } from '../middleware/auth.ts'

export const donationRoutes = new Hono<AppEnv>()

const DONATION_COLUMNS = `
  d.id, d.title, d.description, d.category, d.quantity, d.condition,
  d.pickup_address, d.pincode, d.lat, d.lng, d.status,
  d.claimed_by_ngo_id, d.claimed_at, d.claim_expires_at, d.delivery_method,
  d.rejected_reason, d.visible_radius_km, d.posted_at, d.created_at, d.updated_at
`

/** Photos are joined as an aggregate so one round trip returns a whole brick. */
const PHOTO_AGG = `
  coalesce(
    (select json_agg(json_build_object('path', ph.storage_path, 'sortOrder', ph.sort_order)
                     order by ph.sort_order)
     from public.donation_photos ph where ph.donation_id = d.id),
    '[]'::json
  ) as photos
`

donationRoutes.post('/', requireRole('donor'), async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const parsed = donationDraftSchema.safeParse(body)

  if (!parsed.success) {
    // The condition gates surface here. Their `blocks` copy is the message.
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const draft = parsed.data

  const created = await withActor(actor, async (tx) => {
    const { rows: profileRows } = await tx.query(
      'select id from public.profiles where user_id = app.current_user_id()',
    )
    const donorId = profileRows[0]?.id
    if (!donorId) throw new Error('no profile for the signed-in user')

    const { rows } = await tx.query(
      `insert into public.donations
         (donor_id, title, description, category, quantity, condition,
          condition_checklist, pickup_address, pincode, lat, lng)
       values ($1, $2, $3, $4::public.donation_category, $5, $6::public.donation_condition,
               $7::jsonb, $8, $9, $10, $11)
       returning id`,
      [
        donorId,
        draft.title,
        draft.description ?? null,
        draft.category,
        draft.quantity,
        draft.condition,
        JSON.stringify(draft.conditionChecklist),
        draft.pickupAddress,
        draft.pincode,
        draft.lat ?? null,
        draft.lng ?? null,
      ],
    )

    const donationId = rows[0].id as string

    // The deferred constraint trigger checks the 1-5 photo rule at COMMIT, by
    // which point all of these are in place.
    for (const [index, path] of draft.photoPaths.entries()) {
      await tx.query(
        'insert into public.donation_photos (donation_id, storage_path, sort_order) values ($1, $2, $3)',
        [donationId, path, index],
      )
    }

    return donationId
  })

  return c.json({ id: created }, 201)
})

/** The donor's own items, newest first. */
donationRoutes.get('/mine', requireRole('donor'), async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select ${DONATION_COLUMNS}, ${PHOTO_AGG}
       from public.donations d
       join public.profiles p on p.id = d.donor_id
       where p.user_id = app.current_user_id()
       order by d.created_at desc`,
    )
    return rows
  })

  return c.json({ donations: rows })
})

/**
 * The wall. Returns only what RLS lets this NGO see — posted, category-matched
 * and inside the item's current radius. There is deliberately no WHERE clause
 * here doing that filtering, so it cannot drift from the policy.
 */
donationRoutes.get('/wall', requireRole('ngo'), async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select ${DONATION_COLUMNS}, ${PHOTO_AGG}
       from public.donations d
       where d.status = 'posted'
       order by d.posted_at desc
       limit 200`,
    )
    return rows
  })

  return c.json({ donations: rows })
})

/** Items this NGO has claimed, in any state. */
donationRoutes.get('/claimed', requireRole('ngo'), async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select ${DONATION_COLUMNS}, ${PHOTO_AGG}
       from public.donations d
       where d.claimed_by_ngo_id is not null
         and d.status <> 'posted'
       order by d.claimed_at desc nulls last`,
    )
    return rows
  })

  return c.json({ donations: rows })
})

donationRoutes.get('/:id', requireAuth, async (c) => {
  const actor = actorOf(c)
  const id = c.req.param('id')

  const row = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select ${DONATION_COLUMNS}, ${PHOTO_AGG} from public.donations d where d.id = $1`,
      [id],
    )
    return rows[0] ?? null
  })

  // RLS returning nothing and the row not existing are indistinguishable here,
  // deliberately — a 404 either way leaks nothing about other people's items.
  if (!row) return c.json({ error: 'That item is not on the wall.' }, 404)

  return c.json({ donation: row })
})

/**
 * First-claim-wins. The RPC takes a row lock with SKIP LOCKED, so of two
 * simultaneous claims exactly one returns a row and the other returns none.
 */
donationRoutes.post('/:id/claim', requireRole('ngo'), async (c) => {
  const actor = actorOf(c)
  const id = c.req.param('id')

  const claimed = await withActor(actor, async (tx) => {
    const { rows: ngoRows } = await tx.query(
      `select n.id from public.ngos n
       join public.profiles p on p.id = n.profile_id
       where p.user_id = app.current_user_id()`,
    )
    const ngoId = ngoRows[0]?.id
    if (!ngoId) return { error: 'no-ngo' as const }

    const { rows } = await tx.query('select * from app.claim_donation($1, $2)', [id, ngoId])
    return rows[0] ? { donation: rows[0] } : { error: 'taken' as const }
  })

  if ('error' in claimed) {
    if (claimed.error === 'no-ngo') {
      return c.json({ error: 'Your organisation record is missing. Contact us.' }, 403)
    }
    return c.json({ error: 'Already claimed.', code: 'already_claimed' }, 409)
  }

  return c.json({ donation: claimed.donation })
})

/**
 * The single status-change endpoint. Every move goes through transition() here
 * and through the guard_donation_transition trigger in the database — the UI
 * check is a courtesy, the trigger is the guarantee.
 */
donationRoutes.post('/:id/transition', requireAuth, async (c) => {
  const actor = actorOf(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const to = body?.to as DonationStatus | undefined
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null

  if (!to) return c.json({ error: 'Say which state to move to.' }, 400)

  try {
    const updated = await withActor(actor, async (tx) => {
      const { rows: current } = await tx.query(
        'select status from public.donations where id = $1 for update',
        [id],
      )
      if (!current[0]) return null

      const from = current[0].status as DonationStatus
      const next = transition(from, to, actor.role)

      if (next === 'rejected' && !reason) {
        throw new IllegalTransitionError(from, to, actor.role, 'A rejection needs a reason.')
      }

      const { rows } = await tx.query(
        `update public.donations
         set status = $1::public.donation_status,
             rejected_reason = coalesce($2, rejected_reason)
         where id = $3
         returning ${DONATION_COLUMNS.replaceAll('d.', '')}`,
        [next, reason, id],
      )
      return rows[0] ?? null
    })

    if (!updated) return c.json({ error: 'That item is not on the wall.' }, 404)
    return c.json({ donation: updated })
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
})

/**
 * How the item will travel. Either party to a claimed donation may choose.
 *
 * Picking 'volunteer' opens a pickup for collection; the row is created with
 * system authority because RLS deliberately grants no INSERT on pickups to
 * donors or NGOs — otherwise either could conjure pickups for items that are
 * not theirs.
 */
donationRoutes.post('/:id/delivery', requireAuth, async (c) => {
  const actor = actorOf(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const method = body?.method === 'volunteer' || body?.method === 'courier' ? body.method : null

  if (!method) return c.json({ error: 'Choose a courier or a volunteer.' }, 400)

  // Visibility is the permission check: RLS only returns this row to the donor
  // or the claiming NGO.
  const allowed = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select id, status from public.donations where id = $1 and status = 'claimed'`,
      [id],
    )
    return rows[0] ?? null
  })

  if (!allowed) {
    return c.json({ error: 'That item is not waiting for collection.' }, 404)
  }

  await withSystemActor(async (tx) => {
    await tx.query(
      'update public.donations set delivery_method = $1::public.delivery_method where id = $2',
      [method, id],
    )
    if (method === 'volunteer') {
      await tx.query(
        `insert into public.pickups (donation_id) values ($1)
         on conflict (donation_id) do nothing`,
        [id],
      )
    }
  })

  return c.json({ ok: true, method })
})
