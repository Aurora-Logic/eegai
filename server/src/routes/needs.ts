import { Hono } from 'hono'
import {
  CONSENT_VERSION,
  donorHealthProfileSchema,
  healthRequestSchema,
} from '../../../src/lib/validation/health.ts'
import { withActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'

/**
 * The health-donation lane: blood, hair and breast milk.
 *
 * Mounted at /api/needs rather than /api/health, which is the liveness probe
 * and was here first. The brief's own word for what an institution posts is a
 * need, so nothing is lost and one word stops meaning two things.
 *
 * This is a coordination layer and nothing else. There is no pickup, no
 * shipment, no handover code and no acknowledgement anywhere in this file —
 * brief §6 puts collection, storage, testing and transport with the
 * institution, not with the app. A donor opts in and then goes there.
 *
 * Every privacy rule in brief §5 is enforced in the database (migration 024),
 * not here. These handlers translate HTTP to a function call and back; if one
 * of them forgot a check, the policy would still hold.
 */
export const needRoutes = new Hono<AppEnv>()
needRoutes.use('*', requireAuth)

/** Messages the database raises are written for the person reading them. */
const EXPECTED =
  /not approved|not verified|only an institution|no location|consent|closed|blood group|no such request|not yours/i

function asClientError(error: unknown) {
  const raw = error instanceof Error ? error.message : ''
  return EXPECTED.test(raw) ? raw.replace(/^.*?:\s*/, '') : null
}

// ---------------------------------------------------------------------------
// The donor's own settings
// ---------------------------------------------------------------------------

needRoutes.get('/me', async (c) => {
  const actor = actorOf(c)

  const data = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select categories::text[] as categories, blood_group, notify, share_location,
              consented_at, consent_version, consent_withdrawn_at
       from public.donor_health_profiles
       where profile_id in (select id from public.profiles where user_id = app.current_user_id())`,
    )
    return rows[0] ?? null
  })

  return c.json({
    profile: data,
    consentVersion: CONSENT_VERSION,
    // One flag rather than three checks repeated in every screen.
    consented: Boolean(data?.consented_at && !data?.consent_withdrawn_at),
  })
})

needRoutes.put('/me', async (c) => {
  const actor = actorOf(c)
  const parsed = donorHealthProfileSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const { categories, bloodGroup, notify, shareLocation } = parsed.data

  await withActor(actor, (tx) =>
    tx.query(
      'select app.save_donor_health_profile($1::public.health_category[], $2::public.blood_group, $3, $4)',
      [`{${categories.join(',')}}`, bloodGroup ?? null, notify, shareLocation],
    ),
  )

  return c.json({ ok: true })
})

needRoutes.post('/consent', async (c) => {
  const actor = actorOf(c)
  await withActor(actor, (tx) => tx.query('select app.grant_health_consent($1)', [CONSENT_VERSION]))
  log.info('health consent granted', { requestId: c.get('requestId') })
  return c.json({ ok: true })
})

needRoutes.delete('/consent', async (c) => {
  const actor = actorOf(c)
  await withActor(actor, (tx) => tx.query('select app.withdraw_health_consent()'))
  log.info('health consent withdrawn', { requestId: c.get('requestId') })
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// What a donor is shown
// ---------------------------------------------------------------------------

/**
 * Nearby open requests.
 *
 * There is no radius arithmetic here on purpose. The matching lives in the
 * policy on `health_requests`, so this is a plain select and a route that
 * forgot to filter would return nothing rather than everything.
 *
 * The institution's phone number is deliberately absent. Brief §4 gives a donor
 * the contact details when they opt in, and a public list of direct lines into
 * a blood bank is a different product.
 */
needRoutes.get('/requests', async (c) => {
  const actor = actorOf(c)

  const requests = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      // No join to `ngos`. That table is closed to donors, and an inner join
      // through it drops every row rather than erroring — which is exactly how
      // this wall came back empty the first time it was tried. The institution
      // name is denormalised onto the request for this reason.
      `select hr.id, hr.category, hr.blood_group, hr.urgency, hr.donors_needed,
              hr.responses_count, hr.pincode, hr.note, hr.expires_at, hr.created_at,
              hr.institution_name as institution,
              round(app.distance_km(p.lat, p.lng, hr.lat, hr.lng)::numeric, 1) as distance_km,
              app.has_responded_to(hr.id) as responded
       from public.health_requests hr
       cross join lateral (
         select lat, lng from public.profiles where user_id = app.current_user_id()
       ) p
       where hr.status = 'open'
       order by
         case hr.urgency when 'critical' then 0 when 'urgent' then 1 else 2 end,
         hr.created_at desc`,
    )
    return rows
  })

  return c.json({ requests })
})

/** Everything this donor has said yes to, open or closed. */
needRoutes.get('/responses', async (c) => {
  const actor = actorOf(c)

  const responses = await withActor(actor, async (tx) => {
    // Through the function for the same reason: the contact details live on
    // `ngos`, which a donor cannot read.
    const { rows } = await tx.query('select * from app.my_health_responses()')
    return rows
  })

  return c.json({ responses })
})

needRoutes.post('/requests/:id/respond', async (c) => {
  const actor = actorOf(c)

  try {
    const details = await withActor(actor, async (tx) => {
      const { rows } = await tx.query('select * from app.respond_to_health_request($1)', [
        c.req.param('id'),
      ])
      return rows[0] ?? null
    })

    log.info('health response', { requestId: c.get('requestId') })
    return c.json({ ok: true, institution: details })
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 409)
    throw error
  }
})

needRoutes.delete('/requests/:id/respond', async (c) => {
  const actor = actorOf(c)
  const ok = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select app.withdraw_health_response($1) as ok', [
      c.req.param('id'),
    ])
    return rows[0]?.ok === true
  })

  if (!ok) return c.json({ error: 'You had not said yes to that one.' }, 409)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// The institution's side
// ---------------------------------------------------------------------------

needRoutes.post('/requests', async (c) => {
  const actor = actorOf(c)
  const parsed = healthRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const p = parsed.data

  try {
    const result = await withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        `select * from app.post_health_request(
           $1::public.health_category, $2::public.blood_group, $3::public.request_urgency,
           $4, $5, $6, $7)`,
        [
          p.category,
          p.bloodGroup ?? null,
          p.urgency,
          p.donorsNeeded,
          p.radiusKm,
          p.note ?? null,
          p.expiresInHours,
        ],
      )
      return rows[0]
    })

    log.info('health request posted', {
      requestId: c.get('requestId'),
      category: p.category,
      notified: result?.notified,
    })
    // The count is what the institution is told. Who was alerted is never
    // returned — brief §5, rule 1.
    return c.json({ id: result?.request_id, notified: result?.notified }, 201)
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 409)
    throw error
  }
})

/** This institution's own requests, active and past. */
needRoutes.get('/requests/mine', async (c) => {
  const actor = actorOf(c)

  const requests = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select hr.id, hr.category, hr.blood_group, hr.urgency, hr.donors_needed,
              hr.responses_count, hr.radius_km, hr.note, hr.status,
              hr.expires_at, hr.created_at, hr.closed_at
       from public.health_requests hr
       join public.ngos n on n.id = hr.ngo_id
       join public.profiles p on p.id = n.profile_id
       where p.user_id = app.current_user_id()
       order by hr.created_at desc`,
    )
    return rows
  })

  return c.json({ requests })
})

/**
 * Who said yes.
 *
 * Through the function, which returns a name, a phone number and a time. There
 * is no policy anywhere granting an institution read on `profiles`, so this is
 * the only path — and it cannot return a location, because it does not select
 * one.
 */
needRoutes.get('/requests/:id/responders', async (c) => {
  const actor = actorOf(c)

  try {
    const responders = await withActor(actor, async (tx) => {
      const { rows } = await tx.query('select * from app.request_responders($1)', [
        c.req.param('id'),
      ])
      return rows
    })
    return c.json({ responders })
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 403)
    throw error
  }
})

needRoutes.post('/requests/:id/close', async (c) => {
  const actor = actorOf(c)
  const status = (await c.req.json().catch(() => null))?.status

  if (!['fulfilled', 'closed', 'cancelled'].includes(status)) {
    return c.json({ error: 'Close it as fulfilled, closed or cancelled.' }, 400)
  }

  try {
    await withActor(actor, (tx) =>
      tx.query('select app.close_health_request($1, $2::public.health_request_status)', [
        c.req.param('id'),
        status,
      ]),
    )
    return c.json({ ok: true })
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 403)
    throw error
  }
})

// ---------------------------------------------------------------------------
// Account controls (brief §4)
// ---------------------------------------------------------------------------

/** Immediate, and reversible by an admin. Ends the session on the next request. */
needRoutes.post('/account/deactivate', async (c) => {
  const actor = actorOf(c)
  await withActor(actor, (tx) => tx.query('select app.deactivate_own_account()'))
  log.info('account deactivated by owner', { requestId: c.get('requestId') })
  return c.json({ ok: true })
})

/**
 * A queue and a human, not a button that pretends rows vanish.
 *
 * Audit rows exist to settle disputes about donations that already happened,
 * so "erase everything now" is a promise this product cannot keep. Saying so is
 * better than appearing to.
 */
needRoutes.post('/account/deletion-request', async (c) => {
  const actor = actorOf(c)
  const reason = (await c.req.json().catch(() => null))?.reason
  await withActor(actor, (tx) =>
    tx.query('select app.request_account_deletion($1)', [
      typeof reason === 'string' ? reason.slice(0, 500) : null,
    ]),
  )
  return c.json({ ok: true })
})
