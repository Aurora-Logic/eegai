import { Hono } from 'hono'
import { profileUpdateSchema } from '../../../src/lib/validation/auth.ts'
import { withActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'

export const profileRoutes = new Hono<AppEnv>()
profileRoutes.use('*', requireAuth)

/**
 * Your own record, whatever role you are.
 *
 * No new migration: profiles_self_update, ngos_self_update and
 * volunteers_self_update have existed since M0 and nothing has ever called
 * them. RLS is the authorisation here — every statement below is scoped to the
 * caller's own row by policy, not by a WHERE clause the route could get wrong.
 */
profileRoutes.get('/', async (c) => {
  const actor = actorOf(c)

  const data = await withActor(actor, async (tx) => {
    const { rows: profiles } = await tx.query(
      `select p.id, p.full_name, p.phone, p.role, p.pincode, p.lat, p.lng, p.created_at
       from public.profiles p where p.user_id = app.current_user_id()`,
    )
    const profile = profiles[0]
    if (!profile) return null

    if (profile.role === 'ngo') {
      const { rows } = await tx.query(
        `select n.name, n.address, n.pincode, n.contact_person, n.contact_phone,
                n.monthly_capacity, n.is_accepting, n.has_80g, n.verification_status,
                n.accepts_categories::text[] as accepts_categories,
                app.ngo_claims_this_month(n.id) as claimed_this_month
         from public.ngos n where n.profile_id = $1`,
        [profile.id],
      )
      return { profile, ngo: rows[0] ?? null, volunteer: null }
    }

    if (profile.role === 'volunteer') {
      const { rows } = await tx.query(
        `select v.service_radius_km, v.available_slots, v.verification_status,
                (select count(*) from public.pickups pk where pk.volunteer_id = v.id)::int as pickups
         from public.volunteers v where v.profile_id = $1`,
        [profile.id],
      )
      return { profile, ngo: null, volunteer: rows[0] ?? null }
    }

    return { profile, ngo: null, volunteer: null }
  })

  if (!data) return c.json({ error: 'Your profile is missing. Contact us.' }, 404)
  return c.json(data)
})

profileRoutes.patch('/', async (c) => {
  const actor = actorOf(c)
  const parsed = profileUpdateSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const p = parsed.data

  await withActor(actor, async (tx) => {
    if (p.fullName !== undefined || p.pincode !== undefined) {
      await tx.query(
        `update public.profiles
         set full_name = coalesce($1, full_name),
             pincode = coalesce($2, pincode),
             lat = coalesce($3, lat),
             lng = coalesce($4, lng)
         where user_id = app.current_user_id()`,
        [p.fullName ?? null, p.pincode ?? null, p.lat ?? null, p.lng ?? null],
      )
    }

    // Role-specific fields are applied by role, not by what arrived in the
    // body. A donor posting `serviceRadiusKm` should change nothing rather
    // than reach a table that is not theirs.
    if (actor.role === 'ngo') {
      await tx.query(
        `update public.ngos n
         set name = coalesce($1, n.name),
             address = coalesce($2, n.address),
             pincode = coalesce($3, n.pincode),
             lat = coalesce($4, n.lat),
             lng = coalesce($5, n.lng),
             contact_person = coalesce($6, n.contact_person),
             contact_phone = coalesce($7, n.contact_phone),
             is_accepting = coalesce($8, n.is_accepting),
             accepts_categories = coalesce($9::public.donation_category[], n.accepts_categories)
         from public.profiles pr
         where pr.id = n.profile_id and pr.user_id = app.current_user_id()`,
        [
          p.fullName ?? null,
          p.address ?? null,
          p.pincode ?? null,
          p.lat ?? null,
          p.lng ?? null,
          p.contactPerson ?? null,
          p.contactPhone ?? null,
          p.isAccepting ?? null,
          p.acceptsCategories ?? null,
        ],
      )
    }

    if (actor.role === 'volunteer' && p.serviceRadiusKm !== undefined) {
      await tx.query(
        `update public.volunteers v
         set service_radius_km = $1
         from public.profiles pr
         where pr.id = v.profile_id and pr.user_id = app.current_user_id()`,
        [p.serviceRadiusKm],
      )
    }
  })

  log.info('profile updated', { role: actor.role })
  return c.json({ ok: true })
})
