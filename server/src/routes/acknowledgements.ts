import { Hono, type Context } from 'hono'
import { withActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { transition, IllegalTransitionError } from '../../../src/lib/state-machine.ts'
import type { DonationStatus } from '../../../src/lib/validation/donation.ts'
import { actorOf, requireAuth, requireRole, type AppEnv } from '../middleware/auth.ts'

export const acknowledgementRoutes = new Hono<AppEnv>()

/**
 * M6 — the loop back to the donor.
 *
 * Both endpoints do the same two things in one transaction: write the
 * acknowledgement row and move the donation. Doing them separately is the bug
 * that matters here — an item marked `acknowledged` with no acknowledgement is a
 * donor staring at an empty screen being told their things arrived, and an
 * acknowledgement against an item still `in_transit` is a lie in the other
 * direction. One transaction, or neither.
 *
 * The NGO's identity comes from RLS rather than the request body. A body-supplied
 * ngo_id would let one organisation write an acknowledgement in another's name.
 */

const MAX_NOTE = 1000

interface Outcome {
  /** The state to move to, and the copy that belongs with it. */
  status: Extract<DonationStatus, 'acknowledged' | 'rejected'>
}

async function writeAcknowledgement(c: Context<AppEnv>, { status }: Outcome) {
  const actor = actorOf(c)
  const donationId = c.req.param('donationId')
  const body = await c.req.json().catch(() => null)

  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  const photoPath = typeof body?.photoPath === 'string' ? body.photoPath.trim() : ''

  // A rejection with no reason is refused by a table CHECK as well; this is the
  // message the NGO actually reads, rather than a constraint violation.
  if (status === 'rejected' && note.length < 10) {
    return c.json(
      { error: 'Say why you cannot accept it. The donor sees this, so be specific.' },
      400,
    )
  }

  if (!photoPath) {
    return c.json(
      {
        error:
          status === 'rejected'
            ? 'Add a photo of the problem. Without it this is one word against another.'
            : 'Add a photo of the items as they arrived.',
      },
      400,
    )
  }

  if (note.length > MAX_NOTE) {
    return c.json({ error: 'That note is too long. Keep it under 1000 characters.' }, 400)
  }

  try {
    const result = await withActor(actor, async (tx) => {
      const { rows: ngoRows } = await tx.query(
        `select n.id from public.ngos n
         join public.profiles p on p.id = n.profile_id
         where p.user_id = app.current_user_id()`,
      )
      const ngoId = ngoRows[0]?.id
      if (!ngoId) return { error: 'no-ngo' as const }

      // RLS on donations already limits this to the claiming NGO's own items, so
      // visibility is the permission check.
      const { rows: current } = await tx.query(
        'select status, claimed_by_ngo_id from public.donations where id = $1 for update',
        [donationId],
      )
      if (!current[0]) return { error: 'gone' as const }
      if (current[0].claimed_by_ngo_id !== ngoId) return { error: 'not-yours' as const }

      const next = transition(current[0].status as DonationStatus, status, 'ngo')

      await tx.query(
        `insert into public.acknowledgements (donation_id, ngo_id, photo_path, note)
         values ($1, $2, $3, $4)
         on conflict (donation_id) do update
           set photo_path = excluded.photo_path, note = excluded.note`,
        [donationId, ngoId, photoPath, note || null],
      )

      await tx.query(
        `update public.donations
         set status = $1::public.donation_status,
             rejected_reason = case when $1 = 'rejected' then $2 else rejected_reason end
         where id = $3`,
        [next, note, donationId],
      )

      return { ok: true as const, status: next }
    })

    if ('error' in result) {
      if (result.error === 'no-ngo') {
        return c.json({ error: 'Your organisation record is missing. Contact us.' }, 403)
      }
      if (result.error === 'not-yours') {
        return c.json({ error: 'That item was not claimed by your organisation.' }, 403)
      }
      return c.json({ error: 'That item no longer exists.' }, 404)
    }

    log.info('acknowledgement written', { donation_id: donationId, status: result.status })
    return c.json({ ok: true, status: result.status })
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

/** Goods arrived and are usable. This is the screen the whole product builds to. */
acknowledgementRoutes.post('/:donationId/receive', requireRole('ngo'), (c) =>
  writeAcknowledgement(c, { status: 'acknowledged' }),
)

/** Goods arrived and cannot be used. Reason and photo are both mandatory. */
acknowledgementRoutes.post('/:donationId/reject', requireRole('ngo'), (c) =>
  writeAcknowledgement(c, { status: 'rejected' }),
)

/**
 * The acknowledgement for one item.
 *
 * No role check beyond "signed in" because the RLS policy is the authorisation:
 * acknowledgements_party_read returns the row only to the donor of that item and
 * the NGO that wrote it. Anyone else gets nothing, which reads as a 404.
 */
acknowledgementRoutes.get('/:donationId', requireAuth, async (c) => {
  const actor = actorOf(c)
  const donationId = c.req.param('donationId')

  const row = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select a.id, a.donation_id, a.photo_path, a.note, a.created_at,
              n.name as ngo_name, n.address as ngo_address, n.has_80g,
              d.status
       from public.acknowledgements a
       join public.ngos n on n.id = a.ngo_id
       join public.donations d on d.id = a.donation_id
       where a.donation_id = $1`,
      [donationId],
    )
    return rows[0] ?? null
  })

  if (!row) return c.json({ error: 'Nothing has been recorded for that item yet.' }, 404)
  return c.json({ acknowledgement: row })
})
