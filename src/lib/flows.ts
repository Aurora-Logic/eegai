import type { DonationStatus } from '@/lib/validation/donation'
import type { Role } from '@/lib/state-machine'

/**
 * The journeys, as data, for the flow diagram in the manual.
 *
 * A step is a thing that happens and the person it happens to. The arrows
 * between them are the point — "how does this work" is a question about order,
 * and a list of features never answers it.
 *
 * Written per role and per lane, because a donor giving blood and an
 * organisation collecting sofas are on genuinely different journeys, and a
 * combined diagram would be mostly irrelevant to whoever is reading it.
 */
export interface FlowStep {
  /** What happens. Short — it sits inside a box. */
  label: string
  /** Who does it. Shown small, under the label. */
  who: string
  /** True when the app stops being involved. Drawn differently. */
  handoff?: boolean
}

/** Blood, hair and breast milk. The lane the app opens on. */
export const HEALTH_FLOW: Record<'donor' | 'ngo', FlowStep[]> = {
  donor: [
    { label: 'Say what you can give', who: 'you, once' },
    { label: 'A hospital nearby needs it', who: 'a verified institution' },
    { label: 'You get an alert', who: 'only if it is near you' },
    { label: 'You say you can help', who: 'you' },
    { label: 'You get the address', who: 'and a number to ring' },
    { label: 'You donate there', who: 'at the institution — not in this app', handoff: true },
  ],
  ngo: [
    { label: 'An admin approves you', who: 'per category' },
    { label: 'You post what you need', who: 'you' },
    { label: 'Donors nearby are told', who: 'you see how many, never who' },
    { label: 'Somebody says yes', who: 'you get a name and a number' },
    { label: 'You ring them', who: 'you' },
    { label: 'They donate with you', who: 'in person, at your place', handoff: true },
  ],
}

/**
 * The goods wall's happy path.
 *
 * Every hop here is asserted against TRANSITIONS in flows.test.ts — the same
 * map the database trigger enforces. A diagram that quietly stops matching the
 * product is worse than no diagram, and this is how that gets caught.
 */
export const GOODS_SPINE: DonationStatus[] = [
  'posted',
  'claimed',
  'scheduled',
  'in_transit',
  'received',
  'acknowledged',
]

export const GOODS_FLOW: FlowStep[] = [
  { label: 'You post it', who: 'photos and honest answers' },
  { label: 'An organisation claims it', who: 'verified, nearby, first wins' },
  { label: 'Collection is arranged', who: 'a volunteer or a courier' },
  { label: 'It is collected', who: 'you read your code out' },
  { label: 'It arrives', who: 'they read theirs out' },
  { label: 'They tell you it was used', who: 'with a photo' },
]

/**
 * The volunteer's own journey.
 *
 * GOODS_FLOW is written from the donor's side — "you post it" — and handing
 * that to a volunteer told them their journey starts with something they never
 * do. Same lane, different person, so it needs its own words.
 */
export const VOLUNTEER_FLOW: FlowStep[] = [
  { label: 'An admin verifies you', who: 'ID and a selfie' },
  { label: 'You see pickups near you', who: 'inside the distance you set' },
  { label: 'You take one', who: 'you' },
  { label: 'You collect it', who: 'the donor reads their code to you' },
  { label: 'You deliver it', who: 'the organisation reads theirs' },
  { label: 'It is out of your hands', who: 'they confirm it with the donor', handoff: true },
]

/** Which lane a role can see, and in what order. */
export function flowsFor(role: Role): { title: string; steps: FlowStep[] }[] {
  if (role === 'donor') {
    return [
      { title: 'Blood, hair and breast milk', steps: HEALTH_FLOW.donor },
      { title: 'Things you no longer need', steps: GOODS_FLOW },
    ]
  }
  if (role === 'ngo') {
    return [
      { title: 'Asking for blood, hair or breast milk', steps: HEALTH_FLOW.ngo },
      { title: 'Claiming things from the wall', steps: GOODS_FLOW },
    ]
  }
  if (role === 'volunteer') {
    return [{ title: 'Carrying things from a door to an organisation', steps: VOLUNTEER_FLOW }]
  }
  return [
    { title: 'Blood, hair and breast milk', steps: HEALTH_FLOW.donor },
    { title: 'Things you no longer need', steps: GOODS_FLOW },
  ]
}
