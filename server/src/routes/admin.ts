import { Hono } from 'hono'
import { withActor } from '../lib/db.ts'
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
              n.contact_person, n.contact_phone,
              n.is_accepting, n.created_at,
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
      await tx.query(
        `insert into public.audit_log (actor_id, entity, entity_id, action, after, request_id)
         values (app.current_user_id(), 'ngos', $1, 'verification_reason',
                 jsonb_build_object('status', $2::text, 'reason', $3::text),
                 app.current_request_id())`,
        [c.req.param('id'), status, reason],
      )
    }

    return rows[0] ?? null
  })

  if (!updated) return c.json({ error: 'No such organisation.' }, 404)
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
      await tx.query(
        `insert into public.audit_log (actor_id, entity, entity_id, action, after, request_id)
         values (app.current_user_id(), 'volunteers', $1, 'verification_reason',
                 jsonb_build_object('status', $2::text, 'reason', $3::text),
                 app.current_request_id())`,
        [c.req.param('id'), status, reason],
      )
    }

    return rows[0] ?? null
  })

  if (!updated) return c.json({ error: 'No such volunteer.' }, 404)
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
