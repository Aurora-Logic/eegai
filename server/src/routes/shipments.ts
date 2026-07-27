import { Hono } from 'hono'
import { withActor, withSystemActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { courier, donationStatusFor, CourierError, type ShipmentStatus } from '../lib/courier.ts'
import { transition, IllegalTransitionError } from '../../../src/lib/state-machine.ts'
import type { DonationStatus } from '../../../src/lib/validation/donation.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'

export const shipmentRoutes = new Hono<AppEnv>()

/** A carton of clothes, when nobody has told us otherwise. */
const DEFAULT_WEIGHT_GRAMS = 2000

/**
 * Book a courier for a claimed item.
 *
 * Either party may book, the same as choosing a volunteer — RLS decides who can
 * see the donation, and visibility is the permission check.
 *
 * The shipment row is written before the donation moves, and both happen under
 * the system actor in one transaction. A booked AWB with no shipment row is a
 * courier arriving for an item nobody is expecting.
 */
shipmentRoutes.post('/:donationId/book', requireAuth, async (c) => {
  const actor = actorOf(c)
  const donationId = c.req.param('donationId')
  const body = await c.req.json().catch(() => null)
  const weightGrams =
    typeof body?.weightGrams === 'number' && body.weightGrams > 0
      ? Math.min(body.weightGrams, 50_000)
      : DEFAULT_WEIGHT_GRAMS

  const parties = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select d.id, d.status, d.title, d.pickup_address, d.pincode,
              dp.full_name as donor_name, dp.phone as donor_phone,
              n.name as ngo_name, n.address as ngo_address, n.pincode as ngo_pincode,
              n.contact_phone as ngo_phone
       from public.donations d
       join public.profiles dp on dp.id = d.donor_id
       left join public.ngos n on n.id = d.claimed_by_ngo_id
       where d.id = $1 and d.status = 'claimed'`,
      [donationId],
    )
    return rows[0] ?? null
  })

  if (!parties) {
    return c.json({ error: 'That item is not waiting for collection.' }, 404)
  }
  if (!parties.ngo_name) {
    return c.json({ error: 'No organisation has claimed that item yet.' }, 409)
  }

  const provider = courier()

  let booking
  try {
    booking = await provider.book({
      donationId,
      pickup: {
        name: String(parties.donor_name),
        phone: String(parties.donor_phone ?? ''),
        line: String(parties.pickup_address ?? ''),
        pincode: String(parties.pincode ?? ''),
        city: 'Coimbatore',
      },
      drop: {
        name: String(parties.ngo_name),
        phone: String(parties.ngo_phone ?? ''),
        line: String(parties.ngo_address ?? ''),
        pincode: String(parties.ngo_pincode ?? ''),
        city: 'Coimbatore',
      },
      weightGrams,
      description: String(parties.title),
    })
  } catch (error) {
    if (error instanceof CourierError) {
      log.warn('courier booking refused', { donation_id: donationId, err: error.message })
      return c.json({ error: error.message }, error.retryable ? 503 : 400)
    }
    throw error
  }

  try {
    await withSystemActor(async (tx) => {
      await tx.query(
        `insert into public.shipments
           (donation_id, provider, awb_number, label_url, fee_paise, paid_by, status)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (donation_id) do update
           set provider = excluded.provider, awb_number = excluded.awb_number,
               label_url = excluded.label_url, fee_paise = excluded.fee_paise,
               status = excluded.status`,
        [
          donationId,
          provider.name,
          booking.awbNumber,
          booking.labelUrl,
          booking.feePaise,
          // PLAN.md §11 Q1 — who pays the courier fee — is unanswered, so this
          // records that it is undecided rather than inventing a payer.
          'undecided',
          booking.status,
        ],
      )

      const { rows } = await tx.query(
        'select status from public.donations where id = $1 for update',
        [donationId],
      )
      const next = transition(rows[0].status as DonationStatus, 'scheduled', 'admin')
      await tx.query(
        `update public.donations
         set status = $1::public.donation_status, delivery_method = 'courier'
         where id = $2`,
        [next, donationId],
      )
    })
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }

  log.info('shipment booked', {
    donation_id: donationId,
    provider: provider.name,
    awb: booking.awbNumber,
  })

  return c.json({ shipment: { ...booking, provider: provider.name } }, 201)
})

/** The shipment for one item. RLS decides who sees it. */
shipmentRoutes.get('/:donationId', requireAuth, async (c) => {
  const actor = actorOf(c)

  const row = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select s.id, s.donation_id, s.provider, s.awb_number, s.label_url,
              s.fee_paise, s.paid_by, s.status, s.updated_at
       from public.shipments s where s.donation_id = $1`,
      [c.req.param('donationId')],
    )
    return rows[0] ?? null
  })

  if (!row) return c.json({ error: 'Nothing has been booked for that item.' }, 404)
  return c.json({ shipment: row })
})

/**
 * Pull the latest tracking for one shipment and apply it.
 *
 * Exposed as an endpoint so a party can force a refresh, and called by the sweep
 * below on a timer. Both paths go through `applyTracking` so a manual refresh and
 * a background poll cannot diverge.
 */
shipmentRoutes.post('/:donationId/track', requireAuth, async (c) => {
  const actor = actorOf(c)
  const donationId = c.req.param('donationId')

  const visible = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      'select awb_number from public.shipments where donation_id = $1',
      [donationId],
    )
    return rows[0]?.awb_number as string | undefined
  })

  if (!visible) return c.json({ error: 'Nothing has been booked for that item.' }, 404)

  try {
    const status = await applyTracking(donationId, visible)
    return c.json({ status })
  } catch (error) {
    if (error instanceof CourierError) {
      return c.json({ error: error.message }, error.retryable ? 503 : 400)
    }
    throw error
  }
})

/** The mock's label. A real provider returns its own URL and never reaches this. */
shipmentRoutes.get('/:awb/label', requireAuth, async (c) => {
  const awb = c.req.param('awb')
  if (!awb.startsWith('MOCK')) return c.json({ error: 'Not found.' }, 404)

  return c.text(
    [
      'EEGAI — mock courier label',
      '',
      `AWB  ${awb}`,
      '',
      'This is a placeholder produced by the mock adapter.',
      'A real provider returns its own label; see server/src/lib/courier.ts.',
    ].join('\n'),
    200,
    { 'Content-Type': 'text/plain; charset=utf-8' },
  )
})

/**
 * The states a courier walks a donation through, in order.
 *
 * Explicit rather than a search through TRANSITIONS. A generic path-finder would
 * happily route an item to `received` via `cancelled` if that were ever shorter;
 * this can only ever go forwards along the one path a parcel actually takes.
 */
const COURIER_SPINE: DonationStatus[] = ['scheduled', 'in_transit', 'received']

/**
 * Applies one tracking result: writes the provider status, and walks the donation
 * forward to wherever the courier says it has got to.
 *
 * It *walks* rather than jumps because polling is not guaranteed to observe every
 * stage. A restart, a provider hiccup or simply a delivery faster than the five
 * minute poll can mean the first update we see is `delivered`, and `scheduled ->
 * received` is not an edge — so a single-step version left the item stranded at
 * `scheduled` forever with the parcel already delivered. Found by ageing a mock
 * AWB and watching exactly that happen.
 *
 * Every intermediate step still goes through `transition()` and the database
 * trigger, so the machine validates each edge rather than being bypassed. The
 * intermediate writes are a bonus: the donor timeline gets a real "on its way"
 * row instead of the item teleporting from scheduled to arrived.
 *
 * An `exception` maps to null and therefore moves nothing. That is the whole
 * point: a failed delivery becomes a visible stuck shipment for a human to chase
 * rather than an item quietly marked delivered.
 */
async function applyTracking(donationId: string, awbNumber: string): Promise<ShipmentStatus> {
  const update = await courier().track(awbNumber)

  await withSystemActor(async (tx) => {
    await tx.query('update public.shipments set status = $1 where donation_id = $2', [
      update.status,
      donationId,
    ])

    const target = donationStatusFor(update.status)
    if (!target) return

    const { rows } = await tx.query(
      'select status from public.donations where id = $1 for update',
      [donationId],
    )
    const from = rows[0]?.status as DonationStatus | undefined
    if (!from || from === target) return

    const fromIndex = COURIER_SPINE.indexOf(from)
    const targetIndex = COURIER_SPINE.indexOf(target)

    // Off the spine entirely — cancelled, already acknowledged, or a volunteer
    // pickup that a courier has no business moving. Leave it alone and say so.
    if (fromIndex === -1 || targetIndex === -1) {
      log.warn('courier status is off the delivery path', {
        donation_id: donationId,
        from,
        to: target,
      })
      return
    }

    // Never walk backwards. A provider that re-reports an earlier scan must not
    // drag a received item back into transit.
    if (targetIndex <= fromIndex) return

    try {
      for (let step = fromIndex; step < targetIndex; step++) {
        // The courier acts with the platform's authority here, the same way the
        // volunteer's deliver OTP carries the NGO's — possession of a delivery
        // scan is the evidence, and the machine stays unchanged.
        const next = transition(COURIER_SPINE[step]!, COURIER_SPINE[step + 1]!, 'admin')
        await tx.query(
          'update public.donations set status = $1::public.donation_status where id = $2',
          [next, donationId],
        )
      }
    } catch (error) {
      // A courier reporting an edge we do not have is information, not a crash.
      if (error instanceof IllegalTransitionError) {
        log.warn('courier status has no legal edge', {
          donation_id: donationId,
          from,
          to: target,
        })
        return
      }
      throw error
    }
  })

  return update.status
}

/**
 * Background poll for every shipment still in flight (PLAN.md §M5).
 *
 * Sequential rather than parallel: a real provider rate-limits, and a burst of
 * concurrent requests is the first thing that gets an integration throttled.
 */
export async function trackOpenShipments(): Promise<number> {
  const open = await withSystemActor(async (tx) => {
    const { rows } = await tx.query(
      `select donation_id, awb_number from public.shipments
       where status not in ('delivered', 'cancelled') and awb_number is not null
       limit 100`,
    )
    return rows as { donation_id: string; awb_number: string }[]
  })

  let moved = 0
  for (const shipment of open) {
    try {
      await applyTracking(shipment.donation_id, shipment.awb_number)
      moved += 1
    } catch (error) {
      log.warn('tracking poll failed', {
        awb: shipment.awb_number,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return moved
}
