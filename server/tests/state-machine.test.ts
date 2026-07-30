// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminPool, asActor, closePools, loadFixtures, testPool, type Fixture } from './helpers.ts'

/** The uuid withSystemActor uses; the sweep runs with admin authority. */
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000'

/**
 * The database half of the LOCKED state machine (PLAN.md §7). The TypeScript
 * half is tested in src/lib/state-machine.test.ts; this proves the backstop
 * holds even against a direct SQL UPDATE.
 */
let donor: Fixture
let ngoA: Fixture
let ngoB: Fixture
let admin: Fixture

beforeAll(async () => {
  const f = await loadFixtures()
  donor = f.donors[0]!
  admin = f.admins[0]!

  // Both rivals must accept 'clothes', or RLS hides the item from one of them
  // and the concurrency test passes without ever staging a real race.
  const rivals = f.ngosAccepting('clothes')
  expect(rivals.length).toBeGreaterThanOrEqual(2)
  ngoA = rivals[0]!
  ngoB = rivals[1]!
})

afterAll(closePools)

/** Creates a fresh posted donation owned by `donor`, in a category both NGOs take. */
async function seedPosted(category = 'clothes'): Promise<string> {
  const { rows } = await adminPool.query(
    `insert into public.donations
       (donor_id, title, category, quantity, condition, pickup_address, pincode, lat, lng, status)
     values ($1, 'Test item', $2::public.donation_category, 1, 'good',
             'Test address, Coimbatore', '641001', 11.0168, 76.9558, 'posted')
     returning id`,
    [donor.profileId, category],
  )
  const id = rows[0].id as string
  await adminPool.query(
    `insert into public.donation_photos (donation_id, storage_path, sort_order)
     values ($1, 'seed/0.png', 0)`,
    [id],
  )
  return id
}

describe('transition guard', () => {
  it('allows the happy path posted -> claimed', async () => {
    const id = await seedPosted()

    const claimed = await asActor({ userId: ngoA.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select * from app.claim_donation($1, $2)', [id, ngoA.ngoId])
      return rows[0]
    })

    expect(claimed).toBeDefined()
    expect(claimed.status).toBe('claimed')
    expect(claimed.claimed_by_ngo_id).toBe(ngoA.ngoId)
  })

  it('will not let an NGO claim an item outside its categories', async () => {
    const f = await loadFixtures()
    const bookOnly = f.ngos.find(
      (n) => n.acceptsCategories?.includes('books') && !n.acceptsCategories.includes('clothes'),
    )!
    const id = await seedPosted('clothes')

    const result = await asActor({ userId: bookOnly.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select * from app.claim_donation($1, $2)', [
        id,
        bookOnly.ngoId,
      ])
      return rows
    })

    expect(result).toHaveLength(0)
  })

  it('rejects an edge that does not exist', async () => {
    const id = await seedPosted()

    await expect(
      asActor({ userId: admin.userId, role: 'admin' }, async (tx) => {
        await tx.query(
          `update public.donations
           set status = 'received', claimed_by_ngo_id = (select id from public.ngos limit 1)
           where id = $1`,
          [id],
        )
      }),
    ).rejects.toThrow(/illegal transition posted -> received/)
  })

  it('rejects a legal edge attempted by the wrong role', async () => {
    const id = await seedPosted()

    // posted -> claimed is legal, but only for an NGO or admin.
    await expect(
      asActor({ userId: donor.userId, role: 'donor' }, async (tx) => {
        await tx.query(
          `update public.donations
           set status = 'claimed', claimed_by_ngo_id = (select id from public.ngos limit 1)
           where id = $1`,
          [id],
        )
      }),
    ).rejects.toThrow(/may not move a donation from posted to claimed/)
  })

  it('refuses to move an item with no session established', async () => {
    const id = await seedPosted()

    // An anonymous transaction cannot see the row at all, so the UPDATE is a
    // no-op rather than an error — which is the correct failure mode.
    const result = await asActor(null, async (tx) =>
      tx.query(`update public.donations set status = 'cancelled' where id = $1`, [id]),
    )

    expect(result.rowCount).toBe(0)
  })

  it('holds terminal states terminal', async () => {
    const { rows } = await adminPool.query(
      `select id from public.donations where status = 'acknowledged' limit 1`,
    )

    await expect(
      asActor({ userId: admin.userId, role: 'admin' }, async (tx) => {
        await tx.query(`update public.donations set status = 'received' where id = $1`, [
          rows[0].id,
        ])
      }),
    ).rejects.toThrow(/illegal transition acknowledged -> received/)
  })

  it('requires a reason on rejection', async () => {
    const { rows } = await adminPool.query(
      `select id from public.donations where status = 'received' limit 1`,
    )

    await expect(
      asActor({ userId: admin.userId, role: 'admin' }, async (tx) => {
        await tx.query(`update public.donations set status = 'rejected' where id = $1`, [
          rows[0].id,
        ])
      }),
    ).rejects.toThrow(/donations_rejection_has_reason/)
  })
})

describe('first-claim-wins', () => {
  it('gives the row to exactly one of two simultaneous claims', async () => {
    // The M3 acceptance criterion. Both statements are in flight before either
    // commits, which is the only arrangement that actually exercises
    // FOR UPDATE SKIP LOCKED.
    const id = await seedPosted()

    const ngoAId = ngoA.ngoId!
    const ngoBId = ngoB.ngoId!

    const clientA = await testPool.connect()
    const clientB = await testPool.connect()

    try {
      for (const [client, actor] of [
        [clientA, ngoA],
        [clientB, ngoB],
      ] as const) {
        await client.query('begin')
        await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
          'app.user_id',
          actor.userId,
          'app.user_role',
          'ngo',
        ])
      }

      const [resA, resB] = await Promise.all([
        clientA.query('select * from app.claim_donation($1, $2)', [id, ngoAId]),
        clientB.query('select * from app.claim_donation($1, $2)', [id, ngoBId]),
      ])

      await Promise.all([clientA.query('commit'), clientB.query('commit')])

      const winners = [resA.rows.length, resB.rows.length].filter((n) => n === 1)
      expect(winners).toHaveLength(1)
    } finally {
      clientA.release()
      clientB.release()
    }

    const { rows: final } = await adminPool.query(
      'select status, claimed_by_ngo_id from public.donations where id = $1',
      [id],
    )
    expect(final[0].status).toBe('claimed')
    expect(final[0].claimed_by_ngo_id).not.toBeNull()
  })

  it('returns nothing when the item is already claimed', async () => {
    const id = await seedPosted()

    const first = await asActor({ userId: ngoA.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select * from app.claim_donation($1, $2)', [id, ngoA.ngoId])
      return rows
    })
    expect(first).toHaveLength(1)

    const second = await asActor({ userId: ngoB.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select * from app.claim_donation($1, $2)', [id, ngoB.ngoId])
      return rows
    })
    expect(second).toHaveLength(0)
  })
})

describe('photo count rule', () => {
  it('rejects a sixth photo', async () => {
    const id = await seedPosted()

    await expect(
      adminPool.query(
        `insert into public.donation_photos (donation_id, storage_path, sort_order)
         select $1, 'seed/1.png', g from generate_series(1, 5) g`,
        [id],
      ),
    ).rejects.toThrow(/at most 5 photos|donation_photos_sort_sane/)
  })

  it('rejects a donation left with no photos', async () => {
    const id = await seedPosted()

    await expect(
      adminPool.query('delete from public.donation_photos where donation_id = $1', [id]),
    ).rejects.toThrow(/at least 1 photo/)
  })
})

/**
 * The two rules that keep the wall alive. Both columns existed from M0 and
 * neither was read by anything, so these tests exist to stop that recurring:
 * `monthly_capacity` was shown and edited without ever being enforced, and
 * `claim_expires_at` was written on every claim and looked at by nothing.
 */
describe('capacity and claim expiry', () => {
  it('refuses a claim once the organisation has used its month', async () => {
    const { rows: ngos } = await adminPool.query(
      `select n.id, n.monthly_capacity from public.ngos n limit 1`,
    )
    const ngo = ngos[0]

    // Pin capacity to whatever they have already taken this month. That may be
    // zero, which is the case that caught the bug: 021 treated 0 as "no limit"
    // and let the claim through.
    const { rows: used } = await adminPool.query('select app.ngo_claims_this_month($1) as n', [
      ngo.id,
    ])
    await adminPool.query('update public.ngos set monthly_capacity = $1 where id = $2', [
      used[0].n,
      ngo.id,
    ])

    const { rows: posted } = await adminPool.query(
      `select id from public.donations where status = 'posted' limit 1`,
    )

    await expect(
      adminPool.query('select * from app.claim_donation($1, $2)', [posted[0].id, ngo.id]),
    ).rejects.toThrow(/monthly capacity reached/)

    // Restored, so the ordering of tests in this file cannot matter.
    await adminPool.query('update public.ngos set monthly_capacity = $1 where id = $2', [
      ngo.monthly_capacity,
      ngo.id,
    ])
  })

  it('puts an expired claim back on the wall, and leaves a scheduled one alone', async () => {
    const { rows: claimed } = await adminPool.query(
      `select id from public.donations where status = 'claimed' limit 1`,
    )
    const { rows: scheduled } = await adminPool.query(
      `select id from public.donations where status = 'scheduled' limit 1`,
    )
    if (!claimed[0] || !scheduled[0])
      throw new Error('fixture: need a claimed and a scheduled item')

    await adminPool.query(
      `update public.donations set claim_expires_at = now() - interval '1 hour' where id = any($1)`,
      [[claimed[0].id, scheduled[0].id]],
    )

    await asActor({ userId: SYSTEM_ACTOR, role: 'admin' }, async (tx) => {
      await tx.query('select app.release_expired_claims()')
    })

    const { rows: after } = await adminPool.query(
      'select id, status from public.donations where id = any($1)',
      [[claimed[0].id, scheduled[0].id]],
    )
    const byId = new Map(after.map((r) => [r.id, r.status]))

    expect(byId.get(claimed[0].id)).toBe('posted')
    // Once it is scheduled a volunteer has a slot or a courier has an AWB.
    // Releasing it underneath them strands the item and wastes the journey.
    expect(byId.get(scheduled[0].id)).toBe('scheduled')
  })
})
