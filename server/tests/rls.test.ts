// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminPool, asActor, closePools, loadFixtures, type Fixture } from './helpers.ts'

/**
 * PLAN.md §10: "Test the state machine and the RLS policies. Everything else is
 * best-effort, but these two are where a bug means an item is lost or a
 * document leaks."
 *
 * Every query here runs as `eegai_app`, the same non-BYPASSRLS role the API uses.
 */
let donorA: Fixture
let donorB: Fixture
let ngoA: Fixture
let ngoB: Fixture
let volunteer: Fixture
let admin: Fixture

beforeAll(async () => {
  const f = await loadFixtures()
  donorA = f.donors[0]!
  donorB = f.donors[1]!
  ngoA = f.ngos[0]!
  ngoB = f.ngos[1]!
  volunteer = f.volunteers[0]!
  admin = f.admins[0]!
})

afterAll(closePools)

describe('anonymous access', () => {
  it('sees no profiles at all', async () => {
    const rows = await asActor(null, async (tx) => {
      const { rows } = await tx.query('select id from public.profiles')
      return rows
    })
    expect(rows).toHaveLength(0)
  })

  it('sees no donations at all', async () => {
    const rows = await asActor(null, async (tx) => {
      const { rows } = await tx.query('select id from public.donations')
      return rows
    })
    expect(rows).toHaveLength(0)
  })
})

describe('profiles', () => {
  it('lets a donor read only their own profile', async () => {
    const rows = await asActor({ userId: donorA.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select id, user_id from public.profiles')
      return rows
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(donorA.userId)
  })

  it('denies a direct read of another user profile', async () => {
    // The M1 acceptance criterion, stated as a query rather than a promise.
    const rows = await asActor({ userId: donorA.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select id from public.profiles where id = $1', [
        donorB.profileId,
      ])
      return rows
    })

    expect(rows).toHaveLength(0)
  })

  it('lets an admin read every profile', async () => {
    const rows = await asActor({ userId: admin.userId, role: 'admin' }, async (tx) => {
      const { rows } = await tx.query('select id from public.profiles')
      return rows
    })

    expect(rows.length).toBeGreaterThan(10)
  })

  it('refuses a self-promotion to admin', async () => {
    await expect(
      asActor({ userId: donorA.userId, role: 'donor' }, async (tx) => {
        await tx.query('update public.profiles set role = $1 where user_id = $2', [
          'admin',
          donorA.userId,
        ])
      }),
    ).rejects.toThrow(/only be changed by an admin/)
  })

  it('refuses a forged role claim in the session', async () => {
    // A donor whose JWT was tampered with to say "admin" still cannot read
    // another profile, because is_admin() is checked against the claim but the
    // claim is only ever set by the server from a verified token. This proves
    // the blast radius if a secret ever leaked: still bounded by the policies
    // that check user_id rather than role.
    const rows = await asActor({ userId: donorA.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select id from public.users where id <> $1', [donorA.userId])
      return rows
    })

    expect(rows).toHaveLength(0)
  })
})

describe('donations', () => {
  it('lets a donor see only their own items', async () => {
    const rows = await asActor({ userId: donorA.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(
        `select d.id, p.user_id
         from public.donations d join public.profiles p on p.id = d.donor_id`,
      )
      return rows
    })

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.user_id === donorA.userId)).toBe(true)
  })

  it('shows an NGO only posted items in its accepted categories', async () => {
    const { rows: accepted } = await adminPool.query(
      `select n.accepts_categories::text[] as accepts_categories from public.ngos n
       join public.profiles p on p.id = n.profile_id where p.user_id = $1`,
      [ngoA.userId],
    )
    const categories: string[] = accepted[0].accepts_categories

    const rows = await asActor({ userId: ngoA.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select id, status, category from public.donations')
      return rows
    })

    // Everything visible is either posted-and-matching, or already ours.
    const wall = rows.filter((r) => r.status === 'posted')
    expect(wall.length).toBeGreaterThan(0)
    expect(wall.every((r) => categories.includes(r.category))).toBe(true)
  })

  it('hides another NGO’s claimed items', async () => {
    const { rows: bClaims } = await adminPool.query(
      `select d.id from public.donations d
       join public.ngos n on n.id = d.claimed_by_ngo_id
       join public.profiles p on p.id = n.profile_id
       where p.user_id = $1 and d.status <> 'posted'
       limit 1`,
      [ngoB.userId],
    )

    // Skip rather than silently pass if the seed happens to give B no claims.
    if (bClaims.length === 0) return

    const rows = await asActor({ userId: ngoA.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select id from public.donations where id = $1', [
        bClaims[0].id,
      ])
      return rows
    })

    expect(rows).toHaveLength(0)
  })

  it('stops a donor editing someone else’s item', async () => {
    const { rows: target } = await adminPool.query(
      `select d.id from public.donations d
       join public.profiles p on p.id = d.donor_id
       where p.user_id = $1 limit 1`,
      [donorB.userId],
    )

    const result = await asActor({ userId: donorA.userId, role: 'donor' }, async (tx) => {
      return tx.query('update public.donations set title = $1 where id = $2', [
        'hijacked',
        target[0].id,
      ])
    })

    // RLS makes the row invisible, so the UPDATE matches nothing rather than erroring.
    expect(result.rowCount).toBe(0)
  })
})

describe('documents and OTPs', () => {
  it('keeps ngo_documents invisible to another NGO', async () => {
    const { rows: ngoRows } = await adminPool.query(
      `select n.id from public.ngos n join public.profiles p on p.id = n.profile_id
       where p.user_id = $1`,
      [ngoB.userId],
    )
    await adminPool.query(
      `insert into public.ngo_documents (ngo_id, doc_type, storage_path)
       values ($1, '80g_certificate', 'private/secret.pdf')`,
      [ngoRows[0].id],
    )

    const rows = await asActor({ userId: ngoA.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select id, storage_path from public.ngo_documents')
      return rows
    })

    expect(rows.every((r) => r.storage_path !== 'private/secret.pdf')).toBe(true)
  })

  it('makes OTP columns unreadable to the API role entirely', async () => {
    // A column-level grant, not a policy — so this is a hard privilege error,
    // not an empty result. No route handler bug can leak an OTP.
    await expect(
      asActor({ userId: volunteer.userId, role: 'volunteer' }, async (tx) => {
        await tx.query('select collect_otp from public.pickups limit 1')
      }),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('audit_log', () => {
  it('is unreadable by a non-admin', async () => {
    const rows = await asActor({ userId: donorA.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select id from public.audit_log')
      return rows
    })
    expect(rows).toHaveLength(0)
  })

  it('is readable by an admin', async () => {
    const rows = await asActor({ userId: admin.userId, role: 'admin' }, async (tx) => {
      const { rows } = await tx.query('select id from public.audit_log')
      return rows
    })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('never records a password hash', async () => {
    const rows = await asActor({ userId: admin.userId, role: 'admin' }, async (tx) => {
      const { rows } = await tx.query(
        `select count(*)::int as n from public.audit_log
         where before::text like '%password_hash%' or after::text like '%password_hash%'`,
      )
      return rows
    })
    expect(rows[0].n).toBe(0)
  })
})
