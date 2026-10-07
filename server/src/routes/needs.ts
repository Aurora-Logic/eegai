import { Hono } from 'hono'
import {
  CONSENT_VERSION,
  donorHealthProfileSchema,
  hairOfferSchema,
  healthRequestSchema,
  milkOfferSchema,
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
 * institution, not with the app.
 *
 * Two shapes, per the donor-module spec:
 *
 *   blood          a hospital posts an alert, every registered blood donor is
 *                  told, each answers Available or Not available.
 *   hair, milk     the donor sends an offer to a partner organisation they
 *                  choose, and that organisation moves it along.
 *
 * Every privacy rule in brief §5 is enforced in the database (migration 024),
 * not here. These handlers translate HTTP to a function call and back; if one
 * of them forgot a check, the policy would still hold.
 */
export const needRoutes = new Hono<AppEnv>()
needRoutes.use('*', requireAuth)

/** Messages the database raises are written for the person reading them. */
const EXPECTED =
  /not approved|not verified|only an institution|no location|consent|closed|blood group|no such request|not yours|only blood|future|hair must|eligibility point|does not accept|already have one|cannot become|say why|not sent to you|only a donor|blood is given|no such offer/i

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
      // The date as text: node-postgres turns a `date` into a local-midnight
      // Date, which serialises in UTC and shows the day before east of
      // Greenwich — which is everyone using this.
      `select categories::text[] as categories, blood_group, notify, share_location,
              age, gender, last_blood_donation::text as last_blood_donation, available,
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

  const p = parsed.data

  try {
    await withActor(actor, (tx) =>
      tx.query(
        `select app.save_donor_health_profile(
           $1::public.health_category[], $2::public.blood_group, $3, $4,
           $5, $6::public.gender, $7::date, $8)`,
        [
          `{${p.categories.join(',')}}`,
          p.bloodGroup ?? null,
          p.notify,
          p.shareLocation,
          p.age ?? null,
          p.gender ?? null,
          p.lastBloodDonation ?? null,
          p.available,
        ],
      ),
    )
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 400)
    throw error
  }

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
 * Open blood alerts.
 *
 * No filtering here on purpose: the policy on `health_requests` decides who
 * sees what, so a route that forgot to filter returns nothing rather than
 * everything. Distance is shown for the donor's own sake — "location-based
 * matching improves quick response" — and is null for somebody who has not
 * shared an area.
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
              hr.institution_name as institution, hr.address,
              -- Only for a donor who left "use my area" on; the switch has to
              -- mean something now that it no longer gates the alerts.
              case when p.lat is not null and p.share_location
                   then round(app.distance_km(p.lat, p.lng, hr.lat, hr.lng)::numeric, 1) end
                as distance_km,
              app.has_responded_to(hr.id) as responded,
              -- The donor's own current answer, or null if they have not given one.
              (select r.available from public.health_responses r
                where r.request_id = hr.id and r.profile_id = p.id and r.withdrawn_at is null
                limit 1) as my_answer
       from public.health_requests hr
       cross join lateral (
         select pr.id, l.lat, l.lng, coalesce(d.share_location, false) as share_location
         from public.profiles pr
         cross join app.my_location() l
         left join public.donor_health_profiles d on d.profile_id = pr.id
         where pr.user_id = app.current_user_id()
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

/**
 * "Available to Donate" or "Not Available".
 *
 * The body must say which. A missing answer is refused rather than defaulted:
 * defaulting to Available would hand a hospital somebody's number on the
 * strength of a malformed request.
 */
needRoutes.post('/requests/:id/respond', async (c) => {
  const actor = actorOf(c)
  const available = (await c.req.json().catch(() => null))?.available

  if (typeof available !== 'boolean') {
    return c.json({ error: 'Say whether you are available.' }, 400)
  }

  try {
    const details = await withActor(actor, async (tx) => {
      const { rows } = await tx.query('select * from app.respond_to_health_request($1, $2)', [
        c.req.param('id'),
        available,
      ])
      return rows[0] ?? null
    })

    log.info('health response', { requestId: c.get('requestId'), available })
    // Null when Not available: no contact details for somebody who is not coming.
    return c.json({ ok: true, available, institution: details })
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

  if (!ok) return c.json({ error: 'You had not answered that one.' }, 409)
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
        // No radius: the spec sends a blood alert to every registered blood
        // donor. The column stays, filled by the function, for the history.
        `select * from app.post_health_request(
           $1::public.health_category, $2::public.blood_group, $3::public.request_urgency,
           $4, null, $5, $6)`,
        [p.category, p.bloodGroup, p.urgency, p.donorsNeeded, p.note ?? null, p.expiresInHours],
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

/**
 * This institution's own requests, active and past — plus its own standing.
 *
 * The standing comes back with the list because the screen has to be able to
 * say *why* somebody cannot post: not verified yet, or verified but not
 * approved for any category. A "Post a request" button that fails with an
 * error is a worse answer than a sentence.
 */
needRoutes.get('/requests/mine', async (c) => {
  const actor = actorOf(c)

  const standing = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select n.verification_status, n.health_categories::text[] as health_categories,
              n.visit_instructions, n.org_type, (n.lat is not null) as has_location
       from public.ngos n
       join public.profiles p on p.id = n.profile_id
       where p.user_id = app.current_user_id()`,
    )
    return rows[0] ?? null
  })

  const requests = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select hr.id, hr.category, hr.blood_group, hr.urgency, hr.donors_needed,
              hr.responses_count, hr.not_available_count, hr.radius_km, hr.note, hr.status,
              hr.expires_at, hr.created_at, hr.closed_at
       from public.health_requests hr
       join public.ngos n on n.id = hr.ngo_id
       join public.profiles p on p.id = n.profile_id
       where p.user_id = app.current_user_id()
       order by hr.created_at desc`,
    )
    return rows
  })

  return c.json({ requests, standing })
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
      const { rows } = await tx.query(
        `select profile_id, full_name, phone, age, gender, blood_group,
                last_blood_donation::text as last_blood_donation, responded_at
         from app.request_responders($1)`,
        [c.req.param('id')],
      )
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
// Hair and breast milk: offered by the donor to a partner organisation
// ---------------------------------------------------------------------------

/** The organisations that take this kind of donation. */
needRoutes.get('/partners', async (c) => {
  const actor = actorOf(c)
  const category = c.req.query('category')
  if (category !== 'hair' && category !== 'breast_milk') {
    return c.json({ error: 'Ask for hair or breast_milk partners.' }, 400)
  }

  const partners = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      'select * from app.partner_organisations($1::public.health_category)',
      [category],
    )
    return rows
  })
  return c.json({ partners })
})

/**
 * Send an offer. The body's category picks the schema: the hair form and the
 * milk eligibility points are different questions, and each is checked in full
 * before anything reaches the database — which checks the "must" rules again.
 */
needRoutes.post('/offers', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const category = body?.category

  let ngoId: string
  let details: Record<string, unknown>
  let photoPath: string | null = null

  if (category === 'hair') {
    const parsed = hairOfferSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
    }
    const { ngoId: id, photoPath: photo, ...rest } = parsed.data
    ngoId = id
    details = rest
    photoPath = photo ?? null
  } else if (category === 'breast_milk') {
    const parsed = milkOfferSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: 'Every point must be confirmed.', issues: parsed.error.flatten() },
        400,
      )
    }
    const { ngoId: id, ...rest } = parsed.data
    ngoId = id
    details = rest
  } else {
    return c.json({ error: 'Offer hair or breast milk.' }, 400)
  }

  try {
    const id = await withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        'select app.submit_health_offer($1, $2::public.health_category, $3::jsonb, $4) as id',
        [ngoId, category, JSON.stringify(details), photoPath],
      )
      return rows[0]?.id as string
    })
    log.info('health offer submitted', { requestId: c.get('requestId'), category })
    return c.json({ id }, 201)
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 409)
    throw error
  }
})

needRoutes.get('/offers/mine', async (c) => {
  const actor = actorOf(c)
  const offers = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select * from app.my_health_offers()')
    return rows
  })
  return c.json({ offers })
})

needRoutes.post('/offers/:id/withdraw', async (c) => {
  const actor = actorOf(c)
  const ok = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select app.withdraw_health_offer($1) as ok', [
      c.req.param('id'),
    ])
    return rows[0]?.ok === true
  })
  if (!ok) return c.json({ error: 'That one can no longer be withdrawn.' }, 409)
  return c.json({ ok: true })
})

/** Offers sent to the caller's organisation. */
needRoutes.get('/offers/incoming', async (c) => {
  const actor = actorOf(c)
  const offers = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select * from app.incoming_health_offers()')
    return rows
  })
  return c.json({ offers })
})

needRoutes.post('/offers/:id/decide', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const status = body?.status
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  if (!['in_review', 'accepted', 'declined', 'completed'].includes(status)) {
    return c.json({ error: 'Choose in review, accepted, declined or completed.' }, 400)
  }

  try {
    await withActor(actor, (tx) =>
      tx.query('select app.decide_health_offer($1, $2::public.offer_status, $3)', [
        c.req.param('id'),
        status,
        note,
      ]),
    )
    return c.json({ ok: true })
  } catch (error) {
    const message = asClientError(error)
    if (message) return c.json({ error: message }, 409)
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
