import { Hono } from 'hono'
import { withActor, withSystemActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { transition, IllegalTransitionError } from '../../../src/lib/state-machine.ts'
import type { DonationStatus } from '../../../src/lib/validation/donation.ts'
import { actorOf, requireAuth, requireRole, type AppEnv } from '../middleware/auth.ts'

export const pickupRoutes = new Hono<AppEnv>()

const PICKUP_COLUMNS = `
  pk.id, pk.donation_id, pk.volunteer_id, pk.slot_date, pk.slot,
  pk.collect_attempts, pk.deliver_attempts, pk.collected_at, pk.delivered_at,
  pk.created_at
`

/**
 * Unassigned pickups a verified volunteer can take.
 *
 * No radius filter in the WHERE clause — the pickups_volunteer_open policy
 * already restricts this to items inside the volunteer's service radius, and
 * duplicating it here would let the two drift apart.
 */
pickupRoutes.get('/open', requireRole('volunteer'), async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select ${PICKUP_COLUMNS},
              d.title, d.category, d.condition, d.quantity, d.pickup_address, d.pincode,
              d.lat, d.lng, d.status,
              dp.full_name as donor_name,
              n.name as ngo_name, n.address as ngo_address, n.pincode as ngo_pincode,
              coalesce((select json_agg(json_build_object('path', ph.storage_path)
                        order by ph.sort_order)
                        from public.donation_photos ph where ph.donation_id = d.id), '[]'::json) as photos
       from public.pickups pk
       join public.donations d on d.id = pk.donation_id
       join public.profiles dp on dp.id = d.donor_id
       left join public.ngos n on n.id = d.claimed_by_ngo_id
       where pk.volunteer_id is null
       order by pk.created_at`,
    )
    return rows
  })

  return c.json({ pickups: rows })
})

/** The volunteer's own runs, open first. */
pickupRoutes.get('/mine', requireRole('volunteer'), async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select ${PICKUP_COLUMNS},
              d.title, d.category, d.quantity, d.pickup_address, d.pincode, d.status,
              dp.full_name as donor_name, dp.phone as donor_phone,
              n.name as ngo_name, n.address as ngo_address, n.contact_phone as ngo_phone
       from public.pickups pk
       join public.donations d on d.id = pk.donation_id
       join public.profiles dp on dp.id = d.donor_id
       left join public.ngos n on n.id = d.claimed_by_ngo_id
       where pk.volunteer_id in (
         select v.id from public.volunteers v
         join public.profiles p on p.id = v.profile_id
         where p.user_id = app.current_user_id()
       )
       order by pk.delivered_at nulls first, pk.slot_date`,
    )
    return rows
  })

  return c.json({ pickups: rows })
})

/**
 * Accept a pickup and choose a slot. Moves the donation claimed -> scheduled
 * and issues both OTPs.
 *
 * The same SKIP LOCKED shape as claiming: two volunteers tapping "I'll take
 * this" at once must not both get it.
 */
pickupRoutes.post('/:donationId/accept', requireRole('volunteer'), async (c) => {
  const actor = actorOf(c)
  const donationId = c.req.param('donationId')
  const body = await c.req.json().catch(() => null)
  const slotDate = typeof body?.slotDate === 'string' ? body.slotDate : null
  const slot = body?.slot === 'morning' || body?.slot === 'evening' ? body.slot : null

  if (!slotDate || !slot) {
    return c.json({ error: 'Choose a day and a morning or evening slot.' }, 400)
  }

  // The pilot runs in Coimbatore, so "today" is the IST calendar date — not the
  // server's timezone, and not UTC, which is still yesterday until 05:30 IST.
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
  // Parse as UTC noon so the round-trip check catches impossible dates —
  // '2026-02-31' silently becomes March 3rd, which is how it would otherwise
  // reach the ::date cast below and turn into a 500.
  const parsedDate = new Date(`${slotDate}T12:00:00Z`)
  const isRealDate =
    /^\d{4}-\d{2}-\d{2}$/.test(slotDate) &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === slotDate
  if (!isRealDate) {
    return c.json({ error: 'Choose a day and a morning or evening slot.' }, 400)
  }
  if (slotDate < todayIst) {
    return c.json({ error: 'That slot is in the past. Pick a day from today onwards.' }, 400)
  }
  // The client offers seven days; thirty is the backstop against a crafted
  // request parking a pickup in some distant year.
  if (parsedDate.getTime() - Date.parse(`${todayIst}T12:00:00Z`) > 30 * 86_400_000) {
    return c.json({ error: 'Pick a day within the next month.' }, 400)
  }

  try {
    const result = await withActor(actor, async (tx) => {
      const { rows: me } = await tx.query(
        `select v.id from public.volunteers v
         join public.profiles p on p.id = v.profile_id
         where p.user_id = app.current_user_id() and v.verification_status = 'verified'`,
      )
      if (!me[0]) return { error: 'not-verified' as const }

      // Take the row only if it is still unassigned.
      const { rows: locked } = await tx.query(
        `select id from public.pickups
         where donation_id = $1 and volunteer_id is null
         for update skip locked`,
        [donationId],
      )

      // Nothing came back, and there are two very different reasons for that:
      // another volunteer genuinely won the race, or this pickup is outside our
      // service radius and pickups_volunteer_open never showed it to us at all.
      //
      // They were reported identically, so a volunteer 200m past their own
      // radius was told "another volunteer took this one" about an item nobody
      // had touched. NOTES.md records the same misleading-message trap from M4;
      // this is that lesson applied at the row level rather than the policy one.
      if (!locked[0]) return { error: 'unavailable' as const }

      await tx.query(
        `update public.pickups
         set volunteer_id = $1, slot_date = $2::date, slot = $3::public.pickup_slot
         where id = $4`,
        [me[0].id, slotDate, slot, locked[0].id],
      )

      const { rows: current } = await tx.query(
        'select status from public.donations where id = $1 for update',
        [donationId],
      )
      if (!current[0]) return { error: 'gone' as const }

      const next = transition(current[0].status as DonationStatus, 'scheduled', 'volunteer')
      await tx.query(
        `update public.donations
         set status = $1::public.donation_status, delivery_method = 'volunteer'
         where id = $2`,
        [next, donationId],
      )

      return { ok: true as const }
    })

    if ('error' in result) {
      if (result.error === 'not-verified') {
        return c.json({ error: 'Your account is not verified yet.' }, 403)
      }
      if (result.error === 'unavailable') {
        // Read the row with system authority to tell the two cases apart. This
        // is only ever reached on the failure path, so it costs nothing normally.
        const assigned = await withSystemActor(async (tx) => {
          const { rows } = await tx.query(
            'select volunteer_id from public.pickups where donation_id = $1',
            [donationId],
          )
          return rows[0] ? rows[0].volunteer_id !== null : null
        })

        if (assigned === null) {
          return c.json({ error: 'That pickup no longer exists.' }, 404)
        }
        if (assigned) {
          return c.json({ error: 'Another volunteer took this one.', code: 'taken' }, 409)
        }
        return c.json(
          {
            error: 'That pickup is outside the area you cover. Widen your radius to take it.',
            code: 'out-of-range',
          },
          403,
        )
      }
      return c.json({ error: 'That pickup no longer exists.' }, 404)
    }

    await issueOtps(donationId)
    return c.json({ ok: true })
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
})

/**
 * Generates both codes and posts them to the outbox — the collect code to the
 * donor, the deliver code to the receiving NGO.
 *
 * This is the only place a plaintext OTP exists, and it never leaves the
 * server through a response. The volunteer is told the code verbally at the
 * door; the API only ever sees what they type.
 */
async function issueOtps(donationId: string): Promise<void> {
  await withSystemActor(async (tx) => {
    const { rows } = await tx.query('select * from app.issue_pickup_otps($1)', [donationId])
    const codes = rows[0]
    if (!codes) return

    const { rows: parties } = await tx.query(
      `select d.donor_id, n.profile_id as ngo_profile_id, d.title
       from public.donations d
       left join public.ngos n on n.id = d.claimed_by_ngo_id
       where d.id = $1`,
      [donationId],
    )
    const party = parties[0]
    if (!party) return

    await tx.query(
      `insert into public.notifications (profile_id, channel, template_key, payload)
       values ($1, 'sms', 'collect_otp', jsonb_build_object(
                 'donation_id', $2::uuid, 'title', $3::text, 'code', $4::text))`,
      [party.donor_id, donationId, party.title, codes.collect_code],
    )

    if (party.ngo_profile_id) {
      await tx.query(
        `insert into public.notifications (profile_id, channel, template_key, payload)
         values ($1, 'sms', 'deliver_otp', jsonb_build_object(
                   'donation_id', $2::uuid, 'title', $3::text, 'code', $4::text))`,
        [party.ngo_profile_id, donationId, party.title, codes.deliver_code],
      )
    }
  })

  log.info('otps issued', { donation_id: donationId })
}

/**
 * The two gates. `gate` is 'collect' or 'deliver'.
 *
 * Verification and the state change happen together: a code that verifies but
 * fails to advance the item would leave a volunteer holding goods the system
 * thinks are still at the donor's house.
 *
 * The deliver gate advances in_transit -> received, which the state machine
 * reserves for the NGO. That is correct and deliberate: possession of the NGO's
 * code *is* the NGO's consent, so the transition runs with their authority
 * rather than the volunteer's, and the machine stays unchanged.
 */
pickupRoutes.post('/:donationId/verify', requireRole('volunteer'), async (c) => {
  const actor = actorOf(c)
  const donationId = c.req.param('donationId')
  const body = await c.req.json().catch(() => null)
  const gate = body?.gate === 'collect' || body?.gate === 'deliver' ? body.gate : null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''

  if (!gate || !/^\d{4}$/.test(code)) {
    return c.json({ error: 'Enter the 4-digit code.' }, 400)
  }

  // Confirm this volunteer owns the pickup before spending an attempt.
  const owns = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select 1 from public.pickups pk
       where pk.donation_id = $1
         and pk.volunteer_id in (
           select v.id from public.volunteers v
           join public.profiles p on p.id = v.profile_id
           where p.user_id = app.current_user_id()
         )`,
      [donationId],
    )
    return rows.length > 0
  })

  if (!owns) return c.json({ error: 'That pickup is not yours.' }, 403)

  const verified = await withSystemActor(async (tx) => {
    const { rows } = await tx.query('select app.verify_pickup_otp($1, $2, $3) as ok', [
      donationId,
      gate,
      code,
    ])
    return rows[0]?.ok === true
  })

  if (!verified) {
    log.warn('otp rejected', { donation_id: donationId, gate })
    return c.json({ error: 'That code is not right. Ask them to read it again.' }, 401)
  }

  try {
    const to: DonationStatus = gate === 'collect' ? 'in_transit' : 'received'

    const status = await withSystemActor(async (tx) => {
      const { rows } = await tx.query(
        'select status from public.donations where id = $1 for update',
        [donationId],
      )
      if (!rows[0]) return null

      // Validated against the same map the database trigger enforces.
      const next = transition(rows[0].status as DonationStatus, to, 'admin')
      await tx.query(
        'update public.donations set status = $1::public.donation_status where id = $2',
        [next, donationId],
      )
      return next
    })

    if (!status) return c.json({ error: 'That item no longer exists.' }, 404)

    log.info('otp accepted', { donation_id: donationId, gate, status })
    return c.json({ ok: true, status })
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
})

/**
 * A party's own messages. This is how a donor learns their collect code and an
 * NGO learns its deliver code before SMS is wired up in M8 — RLS restricts it
 * to the reader's own rows, so nobody sees a code meant for someone else.
 */
pickupRoutes.get('/notifications', requireAuth, async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select n.id, n.channel, n.template_key, n.payload, n.sent_at, n.created_at
       from public.notifications n
       where n.profile_id in (select id from public.profiles where user_id = app.current_user_id())
       order by n.created_at desc
       limit 50`,
    )
    return rows
  })

  return c.json({ notifications: rows })
})
