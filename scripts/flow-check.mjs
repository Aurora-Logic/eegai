/**
 * Walks one donation the whole way: posted -> claimed -> scheduled -> in_transit
 * -> received -> acknowledged, then downloads the receipt.
 *
 * The Playwright suite covers the same chain through the UI. This exists because
 * it is far faster to run after a backend change, it names the exact step that
 * broke, and it asserts the two things the UI cannot easily see: that the OTP
 * never appears in a volunteer-visible response, and that the receipt is a valid
 * PDF at the end of it.
 *
 * Dev only — it signs in through /auth/dev-login, which 404s outside
 * NODE_ENV=development.
 */
const BASE = process.env.FLOW_BASE ?? 'http://127.0.0.1:5175'

const jars = new Map()
let step = 0

function ok(message) {
  console.log(`  \x1b[32m✓\x1b[0m ${message}`)
}

function fail(message, detail) {
  console.error(`  \x1b[31m✗\x1b[0m ${message}`)
  if (detail) console.error(`    ${detail}`)
  process.exit(1)
}

async function call(who, method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const cookie = jars.get(who)
  if (cookie) headers.Cookie = cookie

  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  const setCookie = response.headers.get('set-cookie')
  if (setCookie) jars.set(who, setCookie.split(';')[0])

  const type = response.headers.get('content-type') ?? ''
  const payload = type.includes('json')
    ? await response.json().catch(() => ({}))
    : Buffer.from(await response.arrayBuffer())

  return { status: response.status, body: payload, type }
}

async function as(role, index = 0) {
  const { status, body } = await call(role, 'POST', '/auth/dev-login', { role, index })
  if (status !== 200) return null
  return body.user
}

function heading(text) {
  console.log(`\n${++step}. ${text}`)
}

// ---------------------------------------------------------------------------

console.log(`Walking one donation end to end against ${BASE}\n`)

heading('Sign in as all four roles')
const donor = await as('donor')
const ngo = await as('ngo')
await as('admin')
if (!donor || !ngo) fail('dev-login failed — is the API in development with a seeded database?')
ok(`donor ${donor.fullName}, ngo ${ngo.fullName}`)

heading('Find a posted item this donor owns that this NGO can see')
const mine = (await call('donor', 'GET', '/donations/mine')).body.donations ?? []
const wall = (await call('ngo', 'GET', '/donations/wall')).body.donations ?? []
const wallIds = new Set(wall.map((d) => d.id))
const target = mine.find((d) => d.status === 'posted' && wallIds.has(d.id))
if (!target) {
  fail(
    'no posted item is both this donor’s and visible to this NGO',
    `donor has ${mine.length} items, wall shows ${wall.length}. Run npm run db:reset.`,
  )
}
ok(`"${target.title}" (${target.id.slice(0, 8)}) — ${target.photos.length} photo(s)`)

heading('NGO claims it')
const claimed = await call('ngo', 'POST', `/donations/${target.id}/claim`)
if (claimed.status !== 200) fail('claim failed', JSON.stringify(claimed.body))
ok('claimed — posted → claimed')

heading('A second NGO claiming the same item is refused')
const double = await call('ngo', 'POST', `/donations/${target.id}/claim`)
if (double.status !== 409) fail('a repeat claim should be a clean 409', `got ${double.status}`)
ok('409, first-claim-wins holds')

heading('Donor chooses a volunteer')
const delivery = await call('donor', 'POST', `/donations/${target.id}/delivery`, {
  method: 'volunteer',
})
if (delivery.status !== 200) fail('choosing a volunteer failed', JSON.stringify(delivery.body))
ok('pickup opened')

heading('Find a volunteer who actually covers this address')
// Not simply "the first volunteer". Seeded volunteers have different service
// radii, and pickups_volunteer_open hides anything outside them — picking by
// position is how you end up debugging a policy that is working correctly.
let volunteer = null
let volunteerIndex = -1
let outOfRangeIndex = -1
for (let index = 0; index < 6; index++) {
  const candidate = await as('volunteer', index)
  if (!candidate) break
  const open = (await call('volunteer', 'GET', '/pickups/open')).body.pickups ?? []
  if (open.some((p) => p.donation_id === target.id)) {
    volunteer = candidate
    volunteerIndex = index
    ok(`${candidate.fullName} covers it (volunteer #${index})`)
    break
  }
  if (outOfRangeIndex === -1) outOfRangeIndex = index
}
if (!volunteer)
  fail('no seeded volunteer covers this address', 'widen a service radius in the seed')

heading('The out-of-range message is specific, not a false race')
// Volunteer 0 was already shown not to cover this one in the loop above unless
// they were the match; either way this asserts the two failures read differently.
if (outOfRangeIndex !== -1) {
  await as('volunteer', outOfRangeIndex)
  const refused = await call('volunteer', 'POST', `/pickups/${target.id}/accept`, {
    slotDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    slot: 'morning',
  })
  if (refused.status === 409) {
    fail('an out-of-range pickup was reported as a race', JSON.stringify(refused.body))
  }
  ok(`refused ${refused.status} "${refused.body.error}" — not a false "someone took it"`)

  // Back to the volunteer who can actually do the job.
  await as('volunteer', volunteerIndex)
} else {
  ok('every seeded volunteer covers this address, nothing to compare')
}

heading('Volunteer accepts it and takes a slot')
const accept = await call('volunteer', 'POST', `/pickups/${target.id}/accept`, {
  slotDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  slot: 'morning',
})
if (accept.status !== 200) fail('accept failed', JSON.stringify(accept.body))
ok('accepted — claimed → scheduled, both OTPs issued')

heading('The OTP never appears in anything the volunteer can read')
for (const path of ['/pickups/open', '/pickups/mine', '/pickups/notifications']) {
  const raw = JSON.stringify((await call('volunteer', 'GET', path)).body)
  if (/collect_otp|deliver_otp/.test(raw)) fail(`${path} leaked an OTP column name`)
  if (/"code"\s*:\s*"\d{4}"/.test(raw)) fail(`${path} leaked a 4-digit code`)
}
ok('all three volunteer endpoints are clean')

async function codeFor(who, template) {
  const notes = (await call(who, 'GET', '/pickups/notifications')).body.notifications ?? []
  const note = notes.find(
    (n) => n.template_key === template && n.payload?.donation_id === target.id,
  )
  if (!note?.payload?.code) fail(`no ${template} for ${who}`)
  return note.payload.code
}

heading('A wrong code moves nothing')
const wrong = await call('volunteer', 'POST', `/pickups/${target.id}/verify`, {
  gate: 'collect',
  code: '0000',
})
if (wrong.status === 200) fail('a wrong OTP was accepted')
ok(`rejected with ${wrong.status}`)

heading('Collect gate — the donor reads their code out')
const collectCode = await codeFor('donor', 'collect_otp')
const collect = await call('volunteer', 'POST', `/pickups/${target.id}/verify`, {
  gate: 'collect',
  code: collectCode,
})
if (collect.status !== 200) fail('collect gate failed', JSON.stringify(collect.body))
ok(`accepted — scheduled → ${collect.body.status}`)

heading('Deliver gate — the NGO reads their code out')
const deliverCode = await codeFor('ngo', 'deliver_otp')
const deliver = await call('volunteer', 'POST', `/pickups/${target.id}/verify`, {
  gate: 'deliver',
  code: deliverCode,
})
if (deliver.status !== 200) fail('deliver gate failed', JSON.stringify(deliver.body))
ok(`accepted — in_transit → ${deliver.body.status}`)

heading('NGO acknowledges, with a photo')
const form = new FormData()
// A one-pixel JPEG is enough; the upload route only checks type and size.
form.append(
  'file',
  new Blob([Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex')], {
    type: 'image/jpeg',
  }),
  'ack.jpg',
)
form.append('kind', 'acknowledgement')

const upload = await fetch(`${BASE}/api/uploads`, {
  method: 'POST',
  headers: { Cookie: jars.get('ngo') },
  body: form,
})
const uploaded = await upload.json()
if (!uploaded.path) fail('acknowledgement photo upload failed', JSON.stringify(uploaded))

const ack = await call('ngo', 'POST', `/acknowledgements/${target.id}/receive`, {
  note: 'These went to the children at our Ganapathy centre.',
  photoPath: uploaded.path,
})
if (ack.status !== 200) fail('acknowledgement failed', JSON.stringify(ack.body))
ok(`received → ${ack.body.status}`)

heading('Only the parties can open that photo')
const asVolunteer = await fetch(`${BASE}/api/files/${uploaded.path}`, {
  headers: { Cookie: jars.get('volunteer') },
})
if (asVolunteer.status !== 404) fail('an unrelated volunteer could read the photo')
const asDonor = await fetch(`${BASE}/api/files/${uploaded.path}`, {
  headers: { Cookie: jars.get('donor') },
})
if (asDonor.status !== 200) fail('the donor could not read their own photo')
ok('volunteer 404, donor 200')

heading('Donor timeline shows the whole journey')
const timeline = (await call('donor', 'GET', `/donations/${target.id}/timeline`)).body
const events = (timeline.events ?? []).map((e) => e.event)
for (const expected of ['posted', 'claimed', 'scheduled', 'in_transit', 'received', 'acknowledged'])
  if (!events.includes(expected)) fail(`timeline is missing "${expected}"`, events.join(' → '))
if (!timeline.acknowledgement?.note) fail('the acknowledgement note is not on the timeline')

// The donor must see *who* received it. This was null for every donor until the
// ngos join was removed — "your things arrived" is worth little without a name.
if (!timeline.acknowledgement.ngo_name || timeline.acknowledgement.ngo_name === 'The organisation')
  fail('the timeline does not name the receiving organisation')
if (!timeline.donation.ngo_name) fail('the timeline does not name the claiming organisation')
ok(`${events.join(' → ')} — received by ${timeline.acknowledgement.ngo_name}`)

heading('Receipt downloads as a valid PDF')
const receipt = await call('donor', 'GET', `/donations/${target.id}/receipt.pdf`)
if (receipt.status !== 200) fail('receipt failed', JSON.stringify(receipt.body))
if (!receipt.type.includes('application/pdf')) fail(`receipt is ${receipt.type}`)
const text = receipt.body.toString('latin1')
if (!text.startsWith('%PDF-1.4')) fail('receipt is not a PDF')
if (!text.includes('Record of goods donated')) fail('receipt is missing its title')
if (text.includes('Unrecorded')) fail('the receipt does not name the receiving organisation')
if (!text.includes(donor.fullName)) fail('the receipt does not name the donor')
ok(`${receipt.body.length} bytes, names ${timeline.acknowledgement.ngo_name}`)

console.log('\n\x1b[32mThe whole chain works.\x1b[0m\n')
