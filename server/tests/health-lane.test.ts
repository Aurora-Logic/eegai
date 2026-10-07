// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminPool, asActor, closePools, loadFixtures } from './helpers.ts'

/**
 * The health-donation lane (migrations 024 and 026), against the four privacy
 * rules the developer brief marks non-negotiable:
 *
 *   1. A donor's exact location is never shown publicly.
 *   2. Collect only what is needed.
 *   3. Only verified institutions can post or broadcast.
 *   4. Consent is explicit and withdrawable.
 *
 * Every query runs as `eegai_app`, the same non-BYPASSRLS role the API uses.
 * Checking these as a superuser would prove nothing.
 *
 * and against the donor-module spec that followed it: a blood alert goes to
 * every registered blood donor, each answers Available or Not available, and
 * hair and breast milk are offered by the donor to a partner they choose.
 *
 * Fixtures are built here rather than taken from the seed, because the point of
 * most of these assertions is a donor the institution has *no* other
 * relationship with — and the seed deliberately links everybody to everybody.
 */
let institution: { userId: string; ngoId: string }
let nearbyDonor: { userId: string; profileId: string }
let farDonor: { userId: string; profileId: string }
let hairDonor: { userId: string; profileId: string }
let awayDonor: { userId: string; profileId: string }
let busyDonor: { userId: string; profileId: string }
let farProfileId: string
let hairProfileId: string
let unverified: { userId: string }
let hairPartner: { userId: string; ngoId: string }
let bystanderOrg: { userId: string }
let admin: { userId: string }
let requestId: string

const AT_HOSPITAL = { lat: 11.0168, lng: 76.9558 }

/** A unique, valid 10-digit Indian mobile: 9 + six of the clock + a counter. */
let seq = 0
function nextPhone() {
  seq += 1
  return `9${Date.now().toString().slice(-6)}${String(seq).padStart(3, '0')}`
}

async function makeDonor(
  phone: string,
  lat: number,
  lng: number,
  categories: string[],
  available = true,
) {
  // register_user returns TABLE(user_id, profile_id), so it is selected from
  // rather than called as a scalar.
  const { rows } = await adminPool.query(
    `select * from app.register_user($1,'x',$2,'donor'::public.user_role,null,null,'641002',$3,$4)`,
    [phone, `Donor ${phone.slice(-4)}`, lat, lng],
  )
  const { user_id: userId, profile_id: profileId } = rows[0]
  await adminPool.query(
    `insert into public.donor_health_profiles
       (profile_id, categories, blood_group, consented_at, consent_version, available)
     values ($1, $2::public.health_category[], 'O+', now(), 1, $3)`,
    [profileId, `{${categories.join(',')}}`, available],
  )
  return { userId: userId as string, profileId: profileId as string }
}

beforeAll(async () => {
  const f = await loadFixtures()

  // By name, not position: the seed's own hospital and hair partner sort among
  // the others, and an index silently lands on whichever sorts first.
  const org = (name: string) => {
    const found = f.ngos.find((n) => n.fullName === name)
    if (!found?.ngoId) throw new Error(`fixture organisation ${name} is missing`)
    return { userId: found.userId, ngoId: found.ngoId }
  }

  // One verified organisation becomes a blood institution.
  const ngo = org('Noyyal Kalvi Maiyam')
  await adminPool.query(
    `update public.ngos
     set health_categories = '{blood}'::public.health_category[],
         visit_instructions = 'Reception, Block B.',
         verification_status = 'verified',
         lat = $2, lng = $3
     where id = $1`,
    [ngo.ngoId, AT_HOSPITAL.lat, AT_HOSPITAL.lng],
  )
  institution = ngo

  // A second organisation that is NOT approved for any health category.
  unverified = { userId: org('Kovai Karunai Illam 1').userId }
  bystanderOrg = { userId: org('Peelamedu Udhavi Trust').userId }
  hairPartner = org('Kovai Anbu Illam')
  admin = { userId: f.admins[0]!.userId }

  nearbyDonor = await makeDonor(nextPhone(), 11.0175, 76.9562, ['blood'])
  farDonor = await makeDonor(nextPhone(), 11.9, 77.9, ['blood'])
  hairDonor = await makeDonor(nextPhone(), 11.0176, 76.9563, ['hair'])
  awayDonor = await makeDonor(nextPhone(), 11.0177, 76.9564, ['blood'], false)
  busyDonor = await makeDonor(nextPhone(), 11.0178, 76.9565, ['blood'])
  farProfileId = farDonor.profileId
  hairProfileId = hairDonor.profileId
})

afterAll(closePools)

describe('rule 3 — only verified institutions can post', () => {
  it('lets an approved institution post, and alerts every available blood donor', async () => {
    const row = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query(
        `select * from app.post_health_request('blood','O+','urgent',3,10,'Two units short.',72)`,
      )
      return rows[0]
    })

    requestId = row.request_id

    // Who was told, not how many. An exact count depends on every donor any
    // earlier run left in the database, so it fails for reasons that have
    // nothing to do with the rule. The spec sends a blood alert to all
    // registered blood donors, so distance no longer excludes anyone — but a
    // hair-only donor and somebody who switched availability off are not told.
    const told = await adminPool.query(
      `select p.id from public.notifications n
       join public.profiles p on p.id = n.profile_id
       where n.template_key = 'health_request_nearby'
         and n.payload->>'request_id' = $1`,
      [requestId],
    )
    const ids = told.rows.map((r) => r.id)

    expect(ids).toContain(nearbyDonor.profileId)
    expect(ids).toContain(farProfileId)
    expect(ids).not.toContain(hairProfileId)
    expect(ids).not.toContain(awayDonor.profileId)
  })

  it('refuses a hair or milk request — those are offered by donors', async () => {
    await expect(
      asActor({ userId: institution.userId, role: 'ngo' }, (tx) =>
        tx.query(`select * from app.post_health_request('hair',null,'routine',1,null,null,72)`),
      ),
    ).rejects.toThrow(/only blood alerts/i)
  })

  it('refuses a blood alert that does not say which group', async () => {
    await expect(
      asActor({ userId: institution.userId, role: 'ngo' }, (tx) =>
        tx.query(`select * from app.post_health_request('blood',null,'routine',1,null,null,72)`),
      ),
    ).rejects.toThrow(/blood group/i)
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

  it('shows it to a blood donor far away as well', async () => {
    const rows = await asActor({ userId: farDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(`select id from public.health_requests where status='open'`)
      return rows
    })
    expect(rows.map((r) => r.id)).toContain(requestId)
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
      tx.query('select * from app.respond_to_health_request($1, true)', [requestId]),
    )

    const seen = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select id from public.profiles where id = $1', [
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
    // Exactly what the spec lets a hospital see of somebody who said yes, and
    // nothing that places them: no area, no coordinates, no address.
    expect(Object.keys(responders[0]!).sort()).toEqual([
      'age',
      'blood_group',
      'full_name',
      'gender',
      'last_blood_donation',
      'phone',
      'profile_id',
      'responded_at',
    ])
  })

  it('gives nobody the number of a donor who said Not available', async () => {
    const answer = await asActor({ userId: busyDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select * from app.respond_to_health_request($1, false)', [
        requestId,
      ])
      return rows[0]
    })
    // And the donor is not handed the hospital's details for a visit they are
    // not making.
    expect(answer?.contact_phone ?? null).toBeNull()

    const responders = await asActor({ userId: institution.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select profile_id from app.request_responders($1)', [
        requestId,
      ])
      return rows
    })
    expect(responders.map((r) => r.profile_id)).not.toContain(busyDonor.profileId)

    const counts = await adminPool.query(
      'select responses_count, not_available_count from public.health_requests where id = $1',
      [requestId],
    )
    expect(counts.rows[0]).toEqual({ responses_count: 1, not_available_count: 1 })
  })

  it('moves the count when a donor changes their answer', async () => {
    await asActor({ userId: busyDonor.userId, role: 'donor' }, (tx) =>
      tx.query('select * from app.respond_to_health_request($1, true)', [requestId]),
    )
    const after = await adminPool.query(
      'select responses_count, not_available_count from public.health_requests where id = $1',
      [requestId],
    )
    expect(after.rows[0]).toEqual({ responses_count: 2, not_available_count: 0 })

    // Back to Not available, so the tests below see the one responder they expect.
    await asActor({ userId: busyDonor.userId, role: 'donor' }, (tx) =>
      tx.query('select * from app.respond_to_health_request($1, false)', [requestId]),
    )
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

describe('hair and breast milk — offered to a partner the donor chooses', () => {
  const HAIR = {
    lengthInches: 14,
    cleanAndDry: true,
    tied: true,
    natural: true,
    chemicallyTreated: false,
  }
  let offerId: string

  it('lists only verified partners that take the donation', async () => {
    const rows = await asActor({ userId: farDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(`select ngo_id from app.partner_organisations('hair')`)
      return rows
    })
    const ids = rows.map((r) => r.ngo_id)
    expect(ids).toContain(hairPartner.ngoId)
    expect(ids).not.toContain(institution.ngoId)
  })

  it('refuses hair that is not clean and dry', async () => {
    await expect(
      asActor({ userId: farDonor.userId, role: 'donor' }, (tx) =>
        tx.query(`select app.submit_health_offer($1, 'hair', $2::jsonb, null)`, [
          hairPartner.ngoId,
          JSON.stringify({ ...HAIR, cleanAndDry: false }),
        ]),
      ),
    ).rejects.toThrow(/clean and completely dry/i)
  })

  it('refuses an offer to an organisation that does not take it', async () => {
    await expect(
      asActor({ userId: farDonor.userId, role: 'donor' }, (tx) =>
        tx.query(`select app.submit_health_offer($1, 'hair', $2::jsonb, null)`, [
          institution.ngoId,
          JSON.stringify(HAIR),
        ]),
      ),
    ).rejects.toThrow(/does not accept/i)
  })

  it('refuses a photo somebody else uploaded', async () => {
    await expect(
      asActor({ userId: farDonor.userId, role: 'donor' }, (tx) =>
        tx.query(`select app.submit_health_offer($1, 'hair', $2::jsonb, $3)`, [
          hairPartner.ngoId,
          JSON.stringify(HAIR),
          `hair/${nearbyDonor.profileId}/x.jpg`,
        ]),
      ),
    ).rejects.toThrow(/not yours/i)
  })

  it('refuses breast milk unless every eligibility point is confirmed', async () => {
    await adminPool.query(
      `update public.ngos set health_categories = '{blood,breast_milk}' where id = $1`,
      [institution.ngoId],
    )
    await expect(
      asActor({ userId: farDonor.userId, role: 'donor' }, (tx) =>
        tx.query(`select app.submit_health_offer($1, 'breast_milk', $2::jsonb, null)`, [
          institution.ngoId,
          JSON.stringify({
            lactating: true,
            goodHealth: true,
            surplus: true,
            voluntary: true,
            informedConsent: true,
            screening: true,
            throughCentre: false,
          }),
        ]),
      ),
    ).rejects.toThrow(/every eligibility point/i)
  })

  it('reaches the chosen partner and nobody else', async () => {
    offerId = await asActor({ userId: farDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(
        `select app.submit_health_offer($1, 'hair', $2::jsonb, null) as id`,
        [hairPartner.ngoId, JSON.stringify(HAIR)],
      )
      return rows[0].id as string
    })

    const incoming = async (userId: string) =>
      asActor({ userId, role: 'ngo' }, async (tx) => {
        const { rows } = await tx.query('select offer_id from app.incoming_health_offers()')
        return rows.map((r) => r.offer_id)
      })

    expect(await incoming(hairPartner.userId)).toContain(offerId)
    expect(await incoming(bystanderOrg.userId)).not.toContain(offerId)

    // And not through the table either.
    const raw = await asActor({ userId: bystanderOrg.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select id from public.health_offers where id = $1', [
        offerId,
      ])
      return rows
    })
    expect(raw).toHaveLength(0)

    const otherDonor = await asActor({ userId: nearbyDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select id from public.health_offers where id = $1', [
        offerId,
      ])
      return rows
    })
    expect(otherDonor).toHaveLength(0)
  })

  it('refuses a second open offer to the same partner', async () => {
    await expect(
      asActor({ userId: farDonor.userId, role: 'donor' }, (tx) =>
        tx.query(`select app.submit_health_offer($1, 'hair', $2::jsonb, null)`, [
          hairPartner.ngoId,
          JSON.stringify(HAIR),
        ]),
      ),
    ).rejects.toThrow(/already have one waiting/i)
  })

  it('lets only the partner move it, and only along the allowed steps', async () => {
    await expect(
      asActor({ userId: bystanderOrg.userId, role: 'ngo' }, (tx) =>
        tx.query(`select app.decide_health_offer($1, 'accepted', null)`, [offerId]),
      ),
    ).rejects.toThrow(/not sent to you/i)

    await expect(
      asActor({ userId: hairPartner.userId, role: 'ngo' }, (tx) =>
        tx.query(`select app.decide_health_offer($1, 'completed', null)`, [offerId]),
      ),
    ).rejects.toThrow(/cannot become/i)

    await expect(
      asActor({ userId: hairPartner.userId, role: 'ngo' }, (tx) =>
        tx.query(`select app.decide_health_offer($1, 'declined', '  ')`, [offerId]),
      ),
    ).rejects.toThrow(/say why/i)

    await asActor({ userId: hairPartner.userId, role: 'ngo' }, (tx) =>
      tx.query(`select app.decide_health_offer($1, 'accepted', 'Post it on Tuesday.')`, [offerId]),
    )

    const mine = await asActor({ userId: farDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query(
        'select status, org_note from app.my_health_offers() where offer_id = $1',
        [offerId],
      )
      return rows[0]
    })
    expect(mine).toEqual({ status: 'accepted', org_note: 'Post it on Tuesday.' })
  })

  it('keeps the donor phone from a partner the offer was not sent to', async () => {
    const phones = await asActor({ userId: bystanderOrg.userId, role: 'ngo' }, async (tx) => {
      const { rows } = await tx.query('select donor_phone from app.incoming_health_offers()')
      return rows
    })
    expect(phones).toHaveLength(0)
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
        tx.query('select * from app.respond_to_health_request($1, true)', [requestId]),
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

describe('the admin side of the lane', () => {
  it('lets an admin see and take down any request, and nobody else', async () => {
    const seen = await asActor({ userId: admin.userId, role: 'admin' }, async (tx) => {
      const { rows } = await tx.query('select id from public.health_requests where id = $1', [
        requestId,
      ])
      return rows
    })
    expect(seen).toHaveLength(1)

    // A different institution cannot close somebody else's request, even though
    // the function accepts an id — the check is inside it, not in the route.
    await expect(
      asActor({ userId: unverified.userId, role: 'ngo' }, (tx) =>
        tx.query("select app.close_health_request($1, 'cancelled')", [requestId]),
      ),
    ).rejects.toThrow(/not yours/i)

    await asActor({ userId: admin.userId, role: 'admin' }, (tx) =>
      tx.query("select app.close_health_request($1, 'cancelled')", [requestId]),
    )

    const after = await adminPool.query('select status from public.health_requests where id = $1', [
      requestId,
    ])
    expect(after.rows[0].status).toBe('cancelled')
  })

  it('keeps one donor from reading another donor complaint', async () => {
    await asActor({ userId: nearbyDonor.userId, role: 'donor' }, (tx) =>
      tx.query("select app.file_report('ngo', null, $1)", ['They were closed when I arrived.']),
    )

    const mine = await asActor({ userId: nearbyDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select id from public.reports')
      return rows
    })
    expect(mine.length).toBeGreaterThanOrEqual(1)

    const theirs = await asActor({ userId: hairDonor.userId, role: 'donor' }, async (tx) => {
      const { rows } = await tx.query('select id from public.reports')
      return rows
    })
    const mineIds = new Set(mine.map((r) => r.id))
    expect(theirs.filter((r) => mineIds.has(r.id))).toHaveLength(0)
  })

  it('refuses to close a complaint without saying what was done', async () => {
    const { rows } = await adminPool.query(
      `insert into public.reports (reporter_id, subject_type, detail)
       values ($1, 'ngo', 'Nobody answered the phone.') returning id`,
      [nearbyDonor.profileId],
    )

    await expect(
      asActor({ userId: admin.userId, role: 'admin' }, (tx) =>
        tx.query("select app.resolve_report($1, 'resolved', '')", [rows[0].id]),
      ),
    ).rejects.toThrow(/what was done/i)

    // And an ordinary donor cannot resolve one at all.
    await expect(
      asActor({ userId: nearbyDonor.userId, role: 'donor' }, (tx) =>
        tx.query("select app.resolve_report($1, 'dismissed', 'nothing')", [rows[0].id]),
      ),
    ).rejects.toThrow(/only an admin/i)
  })

  it('marks only the caller notifications as read', async () => {
    await adminPool.query(
      `insert into public.notifications (profile_id, channel, template_key, payload)
       values ($1, 'push', 'health_request_nearby', '{}'), ($2, 'push', 'health_request_nearby', '{}')`,
      [nearbyDonor.profileId, hairDonor.profileId],
    )

    await asActor({ userId: nearbyDonor.userId, role: 'donor' }, (tx) =>
      tx.query('select app.mark_notifications_read()'),
    )

    const theirs = await adminPool.query(
      'select count(*)::int as unread from public.notifications where profile_id = $1 and read_at is null',
      [hairDonor.profileId],
    )
    expect(theirs.rows[0].unread).toBeGreaterThan(0)
  })
})
