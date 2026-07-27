import { Hono } from 'hono'
import { donationDraftSchema } from '../../../src/lib/validation/donation.ts'
import { transition, IllegalTransitionError } from '../../../src/lib/state-machine.ts'
import type { DonationStatus } from '../../../src/lib/validation/donation.ts'
import { withActor, withSystemActor } from '../lib/db.ts'
import { renderPdf, type PdfBlock } from '../lib/pdf.ts'
import { actorOf, requireAuth, requireRole, type AppEnv } from '../middleware/auth.ts'

/**
 * The pilot is in Coimbatore, so every timestamp a donor or an NGO reads is
 * rendered in IST regardless of where the server happens to run.
 */
const IST = 'Asia/Kolkata'

function formatIst(value: string | Date, withTime = true): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    timeZone: IST,
  }).format(new Date(value))
}

export const donationRoutes = new Hono<AppEnv>()

const DONATION_COLUMNS = `
  d.id, d.title, d.description, d.category, d.quantity, d.condition,
  d.pickup_address, d.pincode, d.lat, d.lng, d.status,
  d.claimed_by_ngo_id, d.claimed_at, d.claim_expires_at, d.delivery_method,
  d.rejected_reason, d.visible_radius_km, d.posted_at, d.created_at, d.updated_at,
  d.posted_on_behalf_by
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

/**
 * The donor timeline (PLAN.md §M6) — everything that happened to one item.
 *
 * Two-step on purpose. Visibility is proved first under the caller's own RLS;
 * only then are the events read. `donation_events` is an owner-run view, so it
 * does *not* enforce RLS itself (see 010_traceability.sql) — querying it before
 * establishing that the caller can see the donation would hand anyone the
 * history of any item by guessing a UUID.
 */
donationRoutes.get('/:id/timeline', requireAuth, async (c) => {
  const actor = actorOf(c)
  const id = c.req.param('id')

  const visible = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      // condition_checklist is not in DONATION_COLUMNS because the wall does not
      // need it. It belongs here: it is exactly what an NGO wants before
      // claiming — the donor's own yes/no answers about what they are sending.
      `select ${DONATION_COLUMNS}, ${PHOTO_AGG}, d.condition_checklist
       from public.donations d
       where d.id = $1`,
      [id],
    )
    return rows[0] ?? null
  })

  if (!visible) return c.json({ error: 'That item is not on the wall.' }, 404)

  const [events, acknowledgement, pickup] = await Promise.all([
    withSystemActor(async (tx) => {
      const { rows } = await tx.query(
        `select e.id, e.created_at, e.event, e.from_status, e.to_status,
                p.role as actor_role
         from public.donation_events e
         left join public.profiles p on p.user_id = e.actor_id
         where e.donation_id = $1
         order by e.created_at`,
        [id],
      )
      return rows
    }),
    // No join to ngos here. `ngos_self_read` lets an organisation read only its
    // own row, so an inner join silently dropped the whole acknowledgement for
    // the one person it is meant for. The NGO's name is resolved below with
    // system authority, after visibility has already been established.
    withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        `select a.photo_path, a.note, a.created_at, a.ngo_id
         from public.acknowledgements a
         where a.donation_id = $1`,
        [id],
      )
      return rows[0] ?? null
    }),
    withActor(actor, async (tx) => {
      const { rows } = await tx.query(
        `select pk.slot_date, pk.slot, pk.collected_at, pk.delivered_at,
                vp.full_name as volunteer_name
         from public.pickups pk
         left join public.volunteers v on v.id = pk.volunteer_id
         left join public.profiles vp on vp.id = v.profile_id
         where pk.donation_id = $1`,
        [id],
      )
      return rows[0] ?? null
    }),
  ])

  // Same two-step as the events above: the caller has already proved they can
  // see this donation, so the organisation's public-facing details are resolved
  // with system authority rather than by widening ngos RLS for every donor.
  const ngoIds = [visible.claimed_by_ngo_id, acknowledgement?.ngo_id].filter(Boolean)
  const ngoNames = new Map<string, { name: string; address: string | null; has_80g: boolean }>()

  if (ngoIds.length > 0) {
    await withSystemActor(async (tx) => {
      const { rows } = await tx.query(
        'select id, name, address, has_80g from public.ngos where id = any($1::uuid[])',
        [ngoIds],
      )
      for (const row of rows) {
        ngoNames.set(row.id, { name: row.name, address: row.address, has_80g: row.has_80g })
      }
    })
  }

  const claimedBy = visible.claimed_by_ngo_id ? ngoNames.get(visible.claimed_by_ngo_id) : undefined

  return c.json({
    donation: {
      ...visible,
      ngo_name: claimedBy?.name ?? null,
      ngo_address: claimedBy?.address ?? null,
      has_80g: claimedBy?.has_80g ?? null,
    },
    events,
    acknowledgement: acknowledgement
      ? {
          ...acknowledgement,
          ngo_name: ngoNames.get(acknowledgement.ngo_id)?.name ?? 'The organisation',
        }
      : null,
    pickup,
  })
})

/**
 * The PDF receipt (PLAN.md §M6).
 *
 * Scoped by RLS the same way as the timeline, and only for an item that actually
 * completed — a receipt for goods still in a volunteer's bag would be a document
 * asserting something untrue.
 *
 * It is deliberately titled a *record of goods donated*, not a tax receipt.
 * PLAN.md §11 Q2 — which legal entity issues the receipt — is still unanswered,
 * and a document that looks like an 80G certificate but is issued by nobody in
 * particular is worse than no document at all. When §11 is settled this becomes
 * a real receipt; until then it is an honest record, which is still the thing a
 * donor wants to keep.
 */
donationRoutes.get('/:id/receipt.pdf', requireAuth, async (c) => {
  const actor = actorOf(c)
  const id = c.req.param('id')

  const data = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      // No ngos join, for the same reason as the timeline: a donor cannot read
      // an organisation's row, so this silently produced "Received by
      // Unrecorded" on the receipt of the one person entitled to it.
      `select d.id, d.title, d.category, d.condition, d.quantity, d.status,
              d.posted_at, d.pincode, d.claimed_by_ngo_id,
              dp.full_name as donor_name,
              a.note as ngo_note, a.created_at as acknowledged_at
       from public.donations d
       join public.profiles dp on dp.id = d.donor_id
       left join public.acknowledgements a on a.donation_id = d.id
       where d.id = $1`,
      [id],
    )
    return rows[0] ?? null
  })

  if (!data) return c.json({ error: 'That item is not on the wall.' }, 404)

  if (data.status !== 'acknowledged') {
    return c.json(
      { error: 'A receipt is issued once the organisation confirms the items arrived.' },
      409,
    )
  }

  // Resolved with system authority once visibility is already proven.
  const ngo = data.claimed_by_ngo_id
    ? await withSystemActor(async (tx) => {
        const { rows } = await tx.query(
          'select name, address, has_80g from public.ngos where id = $1',
          [data.claimed_by_ngo_id],
        )
        return rows[0] ?? null
      })
    : null

  // Short, human-quotable, and derived rather than stored — there is no counter
  // to get out of step with, and it maps straight back to the donation id.
  const reference = `EEG-${String(data.id).slice(0, 8).toUpperCase()}`

  const blocks: PdfBlock[] = [
    { kind: 'text', text: 'EEGAI', font: 'bold', size: 26, gapAfter: 2 },
    {
      kind: 'text',
      text: 'Where giving finds its way. Coimbatore, Tamil Nadu.',
      size: 10,
      gapAfter: 14,
    },
    { kind: 'rule', gapAfter: 20 },

    { kind: 'text', text: 'Record of goods donated', font: 'bold', size: 16, gapAfter: 16 },

    { kind: 'text', text: `Reference    ${reference}`, font: 'mono', size: 10, gapAfter: 2 },
    {
      kind: 'text',
      text: `Issued       ${formatIst(new Date(), false)}`,
      font: 'mono',
      size: 10,
      gapAfter: 18,
    },

    { kind: 'text', text: 'Donor', font: 'bold', size: 11, gapAfter: 2 },
    { kind: 'text', text: String(data.donor_name), gapAfter: 16 },

    { kind: 'text', text: 'What was given', font: 'bold', size: 11, gapAfter: 2 },
    { kind: 'text', text: String(data.title), gapAfter: 2 },
    {
      kind: 'text',
      text:
        `${data.category} - ${String(data.condition).replace(/_/g, ' ')} condition - ` +
        `quantity ${data.quantity}`,
      size: 10,
      gapAfter: 16,
    },

    { kind: 'text', text: 'Received by', font: 'bold', size: 11, gapAfter: 2 },
    { kind: 'text', text: String(ngo?.name ?? 'Unrecorded'), gapAfter: 2 },
    ...(ngo?.address
      ? [{ kind: 'text' as const, text: String(ngo.address), size: 10, gapAfter: 16 }]
      : [{ kind: 'space' as const, height: 10 }]),

    { kind: 'text', text: 'When', font: 'bold', size: 11, gapAfter: 2 },
    {
      kind: 'text',
      text: `Posted on the wall   ${formatIst(data.posted_at)}`,
      size: 10,
      gapAfter: 2,
    },
    {
      kind: 'text',
      text: `Confirmed received   ${formatIst(data.acknowledged_at)}`,
      size: 10,
      gapAfter: 16,
    },

    ...(data.ngo_note
      ? [
          {
            kind: 'text' as const,
            text: 'What the organisation said',
            font: 'bold' as const,
            size: 11,
            gapAfter: 4,
          },
          { kind: 'text' as const, text: String(data.ngo_note), size: 10, gapAfter: 16 },
        ]
      : []),

    { kind: 'space', height: 8 },
    { kind: 'rule', gapAfter: 14 },

    {
      kind: 'text',
      text:
        'This is a record that the goods described above were collected and confirmed received ' +
        'by the organisation named. It is not a tax receipt and it does not by itself support a ' +
        'deduction under Section 80G.',
      size: 9,
      gapAfter: 8,
    },
    {
      kind: 'text',
      text: ngo?.has_80g
        ? 'The receiving organisation holds 80G registration. Ask them directly for a tax receipt.'
        : 'The receiving organisation has not recorded an 80G registration with us.',
      size: 9,
      gapAfter: 8,
    },
    {
      kind: 'text',
      text: `Verify this record at eegai.org using reference ${reference}.`,
      size: 9,
    },
  ]

  const pdf = renderPdf(blocks, `EEGAI record ${reference}`)

  return c.body(new Uint8Array(pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="eegai-${reference}.pdf"`,
    'Cache-Control': 'private, no-store',
  })
})
