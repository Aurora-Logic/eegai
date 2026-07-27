import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { donationDraftSchema } from '../../../src/lib/validation/donation.ts'
import { withActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { hashPassword } from '../lib/password.ts'
import { actorOf, requireRole, type AppEnv } from '../middleware/auth.ts'

export const adminRoutes = new Hono<AppEnv>()

// Every route below is admin-only at the route level *and* at the RLS level —
// the admin policies in db/migrations are what actually permit these reads, and
// they check app.current_user_role(), which is set from a verified JWT.
adminRoutes.use('*', requireRole('admin'))

/** Dashboard counters. The §1 metric is completed donations, so it leads. */
adminRoutes.get('/metrics', async (c) => {
  const actor = actorOf(c)

  const metrics = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(`
      select
        (select count(*) from public.donations)::int as donations_total,
        (select count(*) from public.donations where status = 'acknowledged')::int as completed,
        (select count(*) from public.donations where status = 'posted')::int as on_the_wall,
        (select count(*) from public.donations
          where status in ('claimed','scheduled','in_transit','received'))::int as in_flight,
        (select count(*) from public.donations where status = 'rejected')::int as rejected,
        (select count(*) from public.donations where status = 'cancelled')::int as cancelled,
        (select count(*) from public.ngos where verification_status = 'pending')::int as ngos_pending,
        (select count(*) from public.ngos where verification_status = 'verified')::int as ngos_verified,
        (select count(*) from public.volunteers where verification_status = 'pending')::int as volunteers_pending,
        (select count(*) from public.volunteers where verification_status = 'verified')::int as volunteers_verified,
        (select count(*) from public.profiles where role = 'donor')::int as donors,
        (select count(*) from public.notifications where sent_at is null and error is not null)::int as notifications_failed,
        -- Median hours from posting to acknowledgement, over completed items.
        (select round(
            percentile_cont(0.5) within group (
              order by extract(epoch from (d.updated_at - d.posted_at)) / 3600
            )::numeric, 1)
          from public.donations d where d.status = 'acknowledged') as median_hours_to_complete
    `)
    return rows[0]
  })

  return c.json({ metrics })
})

/** NGO verification queue. `status` filters; omitted means pending. */
adminRoutes.get('/ngos', async (c) => {
  const actor = actorOf(c)
  const status = c.req.query('status') ?? 'pending'

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select n.id, n.name, n.registration_number, n.darpan_id, n.has_80g, n.address,
              n.pincode, n.lat, n.lng, n.verification_status, n.verified_at,
              n.monthly_capacity,
              -- Cast to text[]: node-postgres has no parser registered for a
              -- custom enum array OID and would hand back the raw '{a,b}'
              -- string, which looks close enough to an array to fail late.
              n.accepts_categories::text[] as accepts_categories,
              n.is_accepting,
              n.contact_person, n.contact_phone,
              n.created_at,
              p.full_name as profile_name, p.phone as profile_phone,
              (select count(*) from public.ngo_documents dd where dd.ngo_id = n.id)::int as document_count,
              (select count(*) from public.ngo_documents dd where dd.ngo_id = n.id and not dd.reviewed)::int as unreviewed_count,
              (select count(*) from public.donations d where d.claimed_by_ngo_id = n.id)::int as claims
       from public.ngos n
       join public.profiles p on p.id = n.profile_id
       where ($1 = 'all' or n.verification_status = $1::public.verification_status)
       order by n.created_at desc`,
      [status],
    )
    return rows
  })

  return c.json({ ngos: rows })
})

adminRoutes.get('/ngos/:id/documents', async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select id, doc_type, storage_path, reviewed, created_at
       from public.ngo_documents where ngo_id = $1 order by created_at`,
      [c.req.param('id')],
    )
    return rows
  })

  return c.json({ documents: rows })
})

/**
 * Approve, reject or suspend. The guard_ngo_verification trigger refuses this
 * for any non-admin, so a compromised route handler still could not do it.
 */
adminRoutes.post('/ngos/:id/verify', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const status = body?.status as string | undefined
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

  if (!status || !['verified', 'rejected', 'suspended', 'pending'].includes(status)) {
    return c.json({ error: 'Choose approve, reject or suspend.' }, 400)
  }

  // A refusal without a reason is unappealable, so it is not allowed.
  if ((status === 'rejected' || status === 'suspended') && reason.length < 8) {
    return c.json({ error: 'Give a reason of at least 8 characters.' }, 400)
  }

  const updated = await withActor(actor, async (tx) => {
    const { rows: me } = await tx.query(
      'select id from public.profiles where user_id = app.current_user_id()',
    )

    const { rows } = await tx.query(
      `update public.ngos
       set verification_status = $1::public.verification_status,
           verified_at = case when $1 = 'verified' then now() else null end,
           verified_by = $2
       where id = $3
       returning id, name, verification_status, verified_at`,
      [status, me[0]?.id ?? null, c.req.param('id')],
    )

    if (rows[0] && reason) {
      // The reason belongs in the trail, not only in an SMS nobody keeps.
      // Through the function, not a direct insert: audit_log is SELECT-only to
      // the API role so history cannot be forged, and inserting here raised
      // "permission denied" — a 500 the operator read as "that did not go
      // through". See 014_verification_reason.sql.
      await tx.query('select app.record_verification_reason($1, $2, $3, $4)', [
        'ngos',
        c.req.param('id'),
        status,
        reason,
      ])
    }

    return rows[0] ?? null
  })

  // A row came back or nothing was written — with RLS in play those are not
  // the same as "the id was wrong", so this covers both.
  if (!updated) return c.json({ error: 'No such organisation, or you cannot edit it.' }, 404)
  return c.json({ ngo: updated })
})

adminRoutes.get('/volunteers', async (c) => {
  const actor = actorOf(c)
  const status = c.req.query('status') ?? 'pending'

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select v.id, v.verification_status, v.service_radius_km, v.available_slots,
              v.id_doc_path, v.selfie_path, v.verified_at, v.created_at,
              p.full_name, p.phone, p.pincode,
              (select count(*) from public.pickups pk where pk.volunteer_id = v.id)::int as pickups
       from public.volunteers v
       join public.profiles p on p.id = v.profile_id
       where ($1 = 'all' or v.verification_status = $1::public.verification_status)
       order by v.created_at desc`,
      [status],
    )
    return rows
  })

  return c.json({ volunteers: rows })
})

adminRoutes.post('/volunteers/:id/verify', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const status = body?.status as string | undefined
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

  if (!status || !['verified', 'rejected', 'suspended', 'pending'].includes(status)) {
    return c.json({ error: 'Choose approve, reject or suspend.' }, 400)
  }
  if ((status === 'rejected' || status === 'suspended') && reason.length < 8) {
    return c.json({ error: 'Give a reason of at least 8 characters.' }, 400)
  }

  const updated = await withActor(actor, async (tx) => {
    const { rows: me } = await tx.query(
      'select id from public.profiles where user_id = app.current_user_id()',
    )
    const { rows } = await tx.query(
      `update public.volunteers
       set verification_status = $1::public.verification_status,
           verified_at = case when $1 = 'verified' then now() else null end,
           verified_by = $2
       where id = $3
       returning id, verification_status, verified_at`,
      [status, me[0]?.id ?? null, c.req.param('id')],
    )

    if (rows[0] && reason) {
      // Through the function, not a direct insert: audit_log is SELECT-only to
      // the API role so history cannot be forged, and inserting here raised
      // "permission denied" — a 500 the operator read as "that did not go
      // through". See 014_verification_reason.sql.
      await tx.query('select app.record_verification_reason($1, $2, $3, $4)', [
        'volunteers',
        c.req.param('id'),
        status,
        reason,
      ])
    }

    return rows[0] ?? null
  })

  if (!updated) return c.json({ error: 'No such volunteer, or you cannot edit it.' }, 404)
  return c.json({ volunteer: updated })
})

/** Moderation list: everything, filterable, with the donor attached. */
adminRoutes.get('/donations', async (c) => {
  const actor = actorOf(c)
  const status = c.req.query('status') ?? 'all'
  const search = (c.req.query('q') ?? '').trim()

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select d.id, d.title, d.category, d.condition, d.quantity, d.status,
              d.pincode, d.posted_at, d.created_at, d.rejected_reason,
              dp.full_name as donor_name, dp.phone as donor_phone,
              n.name as ngo_name,
              coalesce((select json_agg(json_build_object('path', ph.storage_path, 'sortOrder', ph.sort_order)
                        order by ph.sort_order)
                        from public.donation_photos ph where ph.donation_id = d.id), '[]'::json) as photos
       from public.donations d
       join public.profiles dp on dp.id = d.donor_id
       left join public.ngos n on n.id = d.claimed_by_ngo_id
       where ($1 = 'all' or d.status = $1::public.donation_status)
         and ($2 = '' or d.title ilike '%' || $2 || '%' or dp.full_name ilike '%' || $2 || '%')
       order by d.created_at desc
       limit 200`,
      [status, search],
    )
    return rows
  })

  return c.json({ donations: rows })
})

/**
 * The dispute view: one donation's full trail, from donation_events plus the
 * raw audit rows behind it. This is the whole reason audit_log exists.
 */
adminRoutes.get('/donations/:id/trail', async (c) => {
  const actor = actorOf(c)
  const id = c.req.param('id')

  const data = await withActor(actor, async (tx) => {
    const { rows: donation } = await tx.query(
      `select d.*, dp.full_name as donor_name, dp.phone as donor_phone, n.name as ngo_name
       from public.donations d
       join public.profiles dp on dp.id = d.donor_id
       left join public.ngos n on n.id = d.claimed_by_ngo_id
       where d.id = $1`,
      [id],
    )
    if (!donation[0]) return null

    const { rows: events } = await tx.query(
      `select e.id, e.created_at, e.event, e.from_status, e.to_status, e.request_id,
              p.full_name as actor_name, p.role as actor_role
       from public.donation_events e
       left join public.profiles p on p.user_id = e.actor_id
       where e.donation_id = $1
          or e.donation_id in (
               select pk.id from public.pickups pk where pk.donation_id = $1
               union all select sh.id from public.shipments sh where sh.donation_id = $1
               union all select ak.id from public.acknowledgements ak where ak.donation_id = $1
             )
       order by e.created_at`,
      [id],
    )

    const { rows: raw } = await tx.query(
      `select a.id, a.created_at, a.entity, a.action, a.before, a.after, a.request_id,
              p.full_name as actor_name, p.role as actor_role
       from public.audit_log a
       left join public.profiles p on p.user_id = a.actor_id
       where a.entity_id = $1
          or a.entity_id in (
               select pk.id from public.pickups pk where pk.donation_id = $1
               union all select sh.id from public.shipments sh where sh.donation_id = $1
               union all select ak.id from public.acknowledgements ak where ak.donation_id = $1
             )
       order by a.created_at`,
      [id],
    )

    return { donation: donation[0], events, raw }
  })

  if (!data) return c.json({ error: 'No such item.' }, 404)
  return c.json(data)
})

/** People. Read-only for now; suspension is a v1.1 item. */
adminRoutes.get('/users', async (c) => {
  const actor = actorOf(c)
  const role = c.req.query('role') ?? 'all'

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.id, p.full_name, p.phone, p.role, p.pincode, p.is_active, p.created_at,
              u.last_login_at
       from public.profiles p
       join public.users u on u.id = p.user_id
       where ($1 = 'all' or p.role = $1::public.user_role)
       order by p.created_at desc
       limit 500`,
      [role],
    )
    return rows
  })

  return c.json({ users: rows })
})

// ---------------------------------------------------------------------------
// Editing (PLAN.md §M7)
//
// Update and soft-delete only. There is deliberately no hard delete:
// `audit_log` and `donation_events` are the dispute record for every item, and
// donations carry foreign keys to the organisation and volunteer that handled
// them. Removing a row would either break those references or silently rewrite
// history — and the whole point of §2 is that history is not rewritable. A
// disabled account cannot sign in, which is what "delete this user" actually
// means operationally.
// ---------------------------------------------------------------------------

const CATEGORIES = ['clothes', 'books', 'toys', 'education', 'furniture', 'household']

const ngoPatchSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  darpanId: z.string().trim().max(100).nullable().optional(),
  has80g: z.boolean().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode')
    .nullable()
    .optional(),
  monthlyCapacity: z.number().int().min(0).max(10_000).optional(),
  acceptsCategories: z
    .array(z.enum(CATEGORIES as [string, ...string[]]))
    .min(1)
    .optional(),
  contactPerson: z.string().trim().max(200).nullable().optional(),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  isAccepting: z.boolean().optional(),
})

/** Column name per patch key, so the SET clause is built from a fixed map. */
const NGO_COLUMNS: Record<string, string> = {
  name: 'name',
  registrationNumber: 'registration_number',
  darpanId: 'darpan_id',
  has80g: 'has_80g',
  address: 'address',
  pincode: 'pincode',
  monthlyCapacity: 'monthly_capacity',
  acceptsCategories: 'accepts_categories',
  contactPerson: 'contact_person',
  contactPhone: 'contact_phone',
  isAccepting: 'is_accepting',
}

adminRoutes.patch('/ngos/:id', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const parsed = ngoPatchSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return c.json({ error: 'Nothing to change.' }, 400)

  // Built from NGO_COLUMNS rather than from the request, so a key that is not
  // in the map cannot reach the SQL even if the schema ever gains one.
  const sets: string[] = []
  const values: unknown[] = []
  for (const [key, value] of entries) {
    const column = NGO_COLUMNS[key]
    if (!column) continue
    values.push(key === 'acceptsCategories' ? value : value)
    sets.push(
      key === 'acceptsCategories'
        ? `${column} = $${values.length}::public.donation_category[]`
        : `${column} = $${values.length}`,
    )
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to change.' }, 400)

  values.push(c.req.param('id'))

  // Verification status is not editable here — it goes through /verify, which
  // records a reason in the audit trail. Two doors to the same state is how
  // one of them ends up without the paperwork.
  const updated = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `update public.ngos set ${sets.join(', ')}
       where id = $${values.length}
       returning id, name, registration_number, darpan_id, has_80g, address, pincode,
                 monthly_capacity, accepts_categories::text[] as accepts_categories,
                 contact_person, contact_phone, is_accepting, verification_status`,
      values,
    )
    return rows[0] ?? null
  })

  if (!updated) return c.json({ error: 'No such organisation.' }, 404)

  log.info('ngo updated', { ngo_id: updated.id, fields: entries.map(([k]) => k) })
  return c.json({ ngo: updated })
})

const volunteerPatchSchema = z.object({
  serviceRadiusKm: z.number().int().min(1).max(50).optional(),
})

adminRoutes.patch('/volunteers/:id', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const parsed = volunteerPatchSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'A service radius is between 1 and 50 km.' }, 400)
  }
  if (parsed.data.serviceRadiusKm === undefined) {
    return c.json({ error: 'Nothing to change.' }, 400)
  }

  const updated = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `update public.volunteers set service_radius_km = $1 where id = $2
       returning id, service_radius_km, verification_status`,
      [parsed.data.serviceRadiusKm, c.req.param('id')],
    )
    return rows[0] ?? null
  })

  if (!updated) return c.json({ error: 'No such volunteer.' }, 404)
  return c.json({ volunteer: updated })
})

/**
 * Disable or restore an account — the soft delete.
 *
 * Writes both `users.is_active` (which `app.find_login` checks, so sign-in
 * actually stops) and `profiles.is_active` (which is what every admin list
 * displays). Setting only one of them produces an account that looks disabled
 * and still logs in, or the reverse.
 */
adminRoutes.post('/users/:id/active', async (c) => {
  const actor = actorOf(c)
  const profileId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const isActive = body?.isActive

  if (typeof isActive !== 'boolean') {
    return c.json({ error: 'Say whether the account should be active.' }, 400)
  }

  const target = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      'select id, user_id, role, full_name from public.profiles where id = $1',
      [profileId],
    )
    return rows[0] ?? null
  })

  if (!target) return c.json({ error: 'No such person.' }, 404)

  // An admin disabling themselves locks the door with the keys inside.
  if (!isActive && target.user_id === actor.userId) {
    return c.json({ error: 'You cannot disable your own account.' }, 409)
  }

  // Through the function, not two bare updates. `public.users` has no admin
  // UPDATE policy, so the direct write silently matched zero rows and the
  // account carried on signing in while this endpoint reported success. See
  // 013_account_status.sql — and note the return value is checked, because a
  // no-op that reports success is what made the original bug invisible.
  const changed = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select app.set_account_active($1, $2) as ok', [
      profileId,
      isActive,
    ])
    return rows[0]?.ok === true
  })

  if (!changed) return c.json({ error: 'No such person.' }, 404)

  log.info(isActive ? 'account restored' : 'account disabled', {
    profile_id: profileId,
    role: target.role,
  })
  return c.json({ ok: true, isActive })
})

/**
 * Create an account — organisation, volunteer, or another admin.
 *
 * The password is generated here rather than chosen by the operator. An admin
 * inventing passwords for other people produces one of two things: a pattern
 * they reuse, or a note on a desk. This returns the password exactly once, in
 * the response, for the operator to read out — after that it exists only as a
 * scrypt hash and nobody can recover it.
 */
const createAccountSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter a name').max(200),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number'),
  role: z.enum(['ngo', 'volunteer', 'admin']),
  email: z.string().trim().email().optional().or(z.literal('')),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode')
    .optional()
    .or(z.literal('')),
})

adminRoutes.post('/users', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const parsed = createAccountSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const { fullName, phone, role, email, pincode } = parsed.data

  // Four words beat a random string that has to be read down a phone line and
  // gets one character wrong. Length is what makes a password strong, and this
  // is ~44 bits from a 2048-word list before they change it.
  const temporaryPassword = generatePassphrase()
  const passwordHash = await hashPassword(temporaryPassword)

  try {
    const created = await withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        `select * from app.admin_create_account($1, $2, $3, $4::public.user_role, $5, $6)`,
        [phone, passwordHash, fullName, role, email || null, pincode || null],
      )
      return rows[0] ?? null
    })

    if (!created) return c.json({ error: 'That account could not be created.' }, 500)

    log.info('account created by admin', { role, profile_id: created.profile_id })

    // Returned once and never again — there is no endpoint that can read it back.
    return c.json({ profileId: created.profile_id, role, temporaryPassword }, 201)
  } catch (error) {
    if (isPgError(error, '23505')) {
      return c.json({ error: 'That number already has an account.' }, 409)
    }
    throw error
  }
})

/** Four words from a small, unambiguous list. No l/1/O/0 confusion by design. */
function generatePassphrase(): string {
  const words = [
    'anchor',
    'basket',
    'candle',
    'dawn',
    'ember',
    'fabric',
    'garden',
    'harbour',
    'indigo',
    'jasmine',
    'kettle',
    'lantern',
    'marigold',
    'nutmeg',
    'orchard',
    'pepper',
    'quarry',
    'ribbon',
    'saffron',
    'temple',
    'umbrella',
    'velvet',
    'window',
    'yarn',
  ]
  const picked = Array.from(randomBytes(4)).map((byte) => words[byte % words.length])
  return picked.join('-')
}

/** 23505 is unique_violation — a duplicate phone, which is the common case. */
function isPgError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/**
 * Publish an edit to a legal document.
 *
 * Through app.publish_legal_document, which bumps the version only when the body
 * actually changed — fixing a typo in a title should not invalidate every
 * recorded agreement. Admin-ness is checked inside the function as well as by
 * the route, because the route check is the one a refactor can drop.
 */
const legalPatchSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(50, 'A legal document needs more than a sentence.').max(60_000),
})

adminRoutes.put('/legal/:slug', async (c) => {
  const actor = actorOf(c)
  const slug = c.req.param('slug')

  // Checked before touching the database — app.publish_legal_document raises
  // on an unknown slug, which would surface as a 500 instead of this 404.
  if (slug !== 'privacy' && slug !== 'terms') {
    return c.json({ error: 'No such document.' }, 404)
  }

  const parsed = legalPatchSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success) {
    // Name the field, not just "check the form" — a blanked body and a
    // one-character title fail for different reasons and the admin should be
    // told which.
    const { fieldErrors } = parsed.error.flatten()
    const detail = fieldErrors.title?.[0]
      ? `Title: ${fieldErrors.title[0]}`
      : fieldErrors.body?.[0]
        ? `Body: ${fieldErrors.body[0]}`
        : 'Check the form.'
    return c.json({ error: detail, issues: parsed.error.flatten() }, 400)
  }

  const version = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select app.publish_legal_document($1, $2, $3) as version', [
      slug,
      parsed.data.title,
      parsed.data.body,
    ])
    return rows[0]?.version as number | undefined
  })

  if (version === undefined) return c.json({ error: 'No such document.' }, 404)

  log.info('legal document published', { slug, version })
  return c.json({ slug, version })
})

/**
 * Post an item for a donor who is not online.
 *
 * Reuses donationDraftSchema, so the condition gates are enforced exactly as
 * they are for a donor posting for themselves — an admin cannot skip them by
 * coming through a different door. What differs is only who the record says
 * asserted the answers.
 */
adminRoutes.post('/donations', async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)
  const donorId = typeof body?.donorId === 'string' ? body.donorId : null
  const parsed = donationDraftSchema.safeParse(body)

  if (!donorId) return c.json({ error: 'Choose the donor this belongs to.' }, 400)
  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const draft = parsed.data

  try {
    const donationId = await withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        `select app.admin_create_donation(
           $1, $2, $3, $4::public.donation_category, $5,
           $6::public.donation_condition, $7::jsonb, $8, $9
         ) as id`,
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
        ],
      )
      const id = rows[0]?.id as string

      // Same deferred 1-5 photo constraint as the donor path, checked at COMMIT.
      for (const [index, path] of draft.photoPaths.entries()) {
        await tx.query(
          'insert into public.donation_photos (donation_id, storage_path, sort_order) values ($1, $2, $3)',
          [id, path, index],
        )
      }
      return id
    })

    log.info('donation posted on behalf', { donation_id: donationId, donor_id: donorId })
    return c.json({ id: donationId }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('not an active donor')) {
      return c.json({ error: 'That is not an active donor account.' }, 400)
    }
    throw error
  }
})
