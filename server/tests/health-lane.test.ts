// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminPool, asActor, closePools, loadFixtures } from './helpers.ts'

/**
 * The health-donation lane (migration 024), against the four privacy rules the
 * developer brief marks non-negotiable:
 *
 *   1. A donor's exact location is never shown publicly.
 *   2. Collect only what is needed.
 *   3. Only verified institutions can post or broadcast.
 *   4. Consent is explicit and withdrawable.
 *
 * Every query runs as `eegai_app`, the same non-BYPASSRLS role the API uses.
 * Checking these as a superuser would prove nothing.
 *
 * Fixtures are built here rather than taken from the seed, because the point of
 * most of these assertions is a donor the institution has *no* other
 * relationship with — and the seed deliberately links everybody to everybody.
 */
let institution: { userId: string; ngoId: string }
let nearbyDonor: { userId: string; profileId: string }
let farDonor: { userId: string; profileId: string }
let hairDonor: { userId: string; profileId: string }
let farProfileId: string
let hairProfileId: string
let unverified: { userId: string }
let requestId: string

const AT_HOSPITAL = { lat: 11.0168, lng: 76.9558 }

/** A unique, valid 10-digit Indian mobile: 9 + six of the clock + a counter. */
let seq = 0
function nextPhone() {
  seq += 1
  return `9${Date.now().toString().slice(-6)}${String(seq).padStart(3, '0')}`
}

async function makeDonor(phone: string, lat: number, lng: number, categories: string[]) {
  // register_user returns TABLE(user_id, profile_id), so it is selected from
  // rather than called as a scalar.
  const { rows } = await adminPool.query(
    `select * from app.register_user($1,'x',$2,'donor'::public.user_role,null,null,'641002',$3,$4)`,
    [phone, `Donor ${phone.slice(-4)}`, lat, lng],
  )
  const { user_id: userId, profile_id: profileId } = rows[0]
  await adminPool.query(
    `insert into public.donor_health_profiles
       (profile_id, categories, blood_group, consented_at, consent_version)
     values ($1, $2::public.health_category[], 'O+', now(), 1)`,
    [profileId, `{${categories.join(',')}}`],
  )
  return { userId: userId as string, profileId: profileId as string }
}

beforeAll(async () => {
  const f = await loadFixtures()

  // One verified organisation becomes a blood institution.
  const ngo = f.ngos[0]!
  await adminPool.query(
    `update public.ngos
     set health_categories = '{blood}'::public.health_category[],
         visit_instructions = 'Reception, Block B.',
         verification_status = 'verified',
         lat = $2, lng = $3
     where id = $1`,
    [ngo.ngoId, AT_HOSPITAL.lat, AT_HOSPITAL.lng],
  )
  institution = { userId: ngo.userId, ngoId: ngo.ngoId! }

  // A second organisation that is NOT approved for any health category.
  unverified = { userId: f.ngos[1]!.userId }

  nearbyDonor = await makeDonor(nextPhone(), 11.0175, 76.9562, ['blood'])
  farDonor = await makeDonor(nextPhone(), 11.9, 77.9, ['blood'])
  hairDonor = await makeDonor(nextPhone(), 11.0176, 76.9563, ['hair'])
  farProfileId = farDonor.profileId
  hairProfileId = hairDonor.profileId
})

afterAll(closePools)

describe('rule 3 — only verified institutions can post', () => {
  it('lets an approved institution post, and alerts only matching donors nearby', async () => {
    const row = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query(
        `select * from app.post_health_request('blood','O+','urgent',3,10,'Two units short.',72)`,
      )
      return rows[0]
    })

    requestId = row.request_id

    // Who was told, not how many. An exact count depends on every donor any
    // earlier run left in the database, so it fails for reasons that have
    // nothing to do with the rule — the rule is that the far donor and the
    // hair donor are not on the list.
    const told = await adminPool.query(
      `select p.id from public.notifications n
       join public.profiles p on p.id = n.profile_id
       where n.template_key = 'health_request_nearby'
         and n.payload->>'request_id' = $1`,
      [requestId],
    )
    const ids = told.rows.map((r) => r.id)

    expect(ids).toContain(nearbyDonor.profileId)
    expect(ids).not.toContain(farProfileId)
    expect(ids).not.toContain(hairProfileId)
  })

  it('refuses an organisation that is not approved for the category', async () => {
    await expect(
      asActor({ userId: unverified.userId, role: 'ngo' }, (tx) =>
        tx.query(`select * from app.post_health_request('blood',null,'routine',1,10,null,72)`),
      ),
    ).rejects.toThrow(/not approved|not verified/i)
  })

  it('refuses a donor outright', async () => {
    await expect(
      asActor({ userId: nearbyDonor.userId, role: 'donor' }, (tx) =>
        tx.query(`select * from app.post_health_request('blood',null,'routine',1,10,null,72)`),
      ),
    ).rejects.toThrow(/only an institution/i)
  })
})

describe('the wall a donor sees', () => {
  it('shows a nearby request in a category they offer', async () => {
    const rows = await asActor({ userId: nearbyDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(`select id from public.health_requests where status='open'`)
      return rows
    })
    expect(rows.map((r) => r.id)).toContain(requestId)
  })

  it('hides it from a donor who offers a different category', async () => {
    const rows = await asActor({ userId: hairDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(`select id from public.health_requests where status='open'`)
      return rows
    })
    expect(rows.map((r) => r.id)).not.toContain(requestId)
  })

  it('hides it from a donor outside the radius', async () => {
    const rows = await asActor({ userId: farDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(`select id from public.health_requests where status='open'`)
      return rows
    })
    expect(rows.map((r) => r.id)).not.toContain(requestId)
  })
})

describe('the wall survives the tables it cannot read', () => {
  it('shows who is asking, without the donor being able to read organisations', async () => {
    // The regression test for an empty wall. `ngos` is closed to donors, and
    // the first version of this screen joined through it — an inner join drops
    // what it cannot see rather than erroring, so the request was visible, the
    // organisation was not, and the whole row silently disappeared. The same
    // shape has now cost this codebase two bugs.
    const seen = await asActor({ userId: nearbyDonor.userId, role: 'donor' }, async (tx) => {
      const { rows: ngos } = await tx.query('select id from public.ngos')
      const { rows } = await tx.query(
        `select institution_name from public.health_requests where id = $1`,
        [requestId],
      )
      return { ngosVisible: ngos.length, name: rows[0]?.institution_name }
    })

    expect(seen.ngosVisible).toBe(0)
    expect(seen.name).toBeTruthy()
  })
})

describe('rule 1 — a donor location never reaches an institution', () => {
  it('gives the institution a name and a phone number, and no profile row', async () => {
    await asActor({ userId: nearbyDonor.userId, role: 'donor' }, (tx) =>
      tx.query('select * from app.respond_to_health_request($1)', [requestId]),
    )

    const seen = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select id, lat, lng from public.profiles where id = $1', [
        nearbyDonor.profileId,
      ])
      return rows
    })

    // The institution has no goods-lane relationship with this donor, so there
    // is no path at all to their row — which is the assertion that matters.
    expect(seen).toHaveLength(0)

    const responders = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select * from app.request_responders($1)', [requestId])
      return rows
    })

    expect(responders).toHaveLength(1)
    expect(Object.keys(responders[0]!).sort()).toEqual([
      'full_name',
      'phone',
      'profile_id',
      'responded_at',
    ])
  })

  it('never lets an institution read a donor health profile', async () => {
    const rows = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select profile_id from public.donor_health_profiles')
      return rows
    })
    expect(rows).toHaveLength(0)
  })

  it('never lets one donor read another donor health profile', async () => {
    const rows = await asActor({ userId: hairDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select profile_id from public.donor_health_profiles')
      return rows
    })
    expect(rows.map((r) => r.profile_id)).not.toContain(nearbyDonor.profileId)
  })
})

describe('rule 4 — consent is explicit and withdrawable', () => {
  it('refuses a response from somebody who has not consented', async () => {
    const { rows } = await adminPool.query(
      `select * from app.register_user($1,'x','No Consent','donor'::public.user_role,null,null,'641002',11.0175,76.9562)`,
      [nextPhone()],
    )
    await adminPool.query(
      `insert into public.donor_health_profiles (profile_id, categories)
       values ($1, '{blood}'::public.health_category[])`,
      [rows[0].profile_id],
    )

    await expect(
      asActor({ userId: rows[0].user_id, role: 'donor' }, (tx) =>
        tx.query('select * from app.respond_to_health_request($1)', [requestId]),
      ),
    ).rejects.toThrow(/consent/i)
  })

  it('takes the wall away the moment consent is withdrawn', async () => {
    await asActor({ userId: hairDonor.userId, role: 'donor' }, (tx) =>
      tx.query('select app.withdraw_health_consent()'),
    )

    const rows = await asActor({ userId: hairDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(`select id from public.health_requests where status='open'`)
      return rows
    })
    expect(rows).toHaveLength(0)
  })

  it('leaves an existing commitment alone when consent is withdrawn', async () => {
    // Somebody who agreed to visit a hospital has made a promise to a person.
    // Cancelling it because they changed a notification setting would be the
    // app speaking on their behalf.
    await asActor({ userId: nearbyDonor.userId, role: 'donor' }, (tx) =>
      tx.query('select app.withdraw_health_consent()'),
    )

    const responders = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select * from app.request_responders($1)', [requestId])
      return rows
    })
    expect(responders).toHaveLength(1)
  })
})
