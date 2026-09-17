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

/**
 * Blood, per the donor-module spec: a hospital posts, every registered blood
 * donor is told, each answers, the hospital rings the ones who can come.
 */
export const HEALTH_FLOW: Record<'donor' | 'ngo', FlowStep[]> = {
  donor: [
    { label: 'Register as a blood donor', who: 'you, once — blood type is required' },
    { label: 'A hospital posts a blood alert', who: 'a verified hospital or blood centre' },
    { label: 'Every blood donor is told', who: 'group, units, hospital, urgency' },
    { label: 'Available or Not available', who: 'you choose' },
    { label: 'The hospital rings you', who: 'only if you said Available' },
    { label: 'You donate there', who: 'at the hospital — not in this app', handoff: true },
  ],
  ngo: [
    { label: 'An admin verifies you', who: 'papers, and the terms you accepted' },
    { label: 'You post a blood alert', who: 'group, units, urgency' },
    { label: 'Every blood donor is told', who: 'you see how many, never who' },
    { label: 'Available donors appear', who: 'name, phone, age, group, last donation' },
    { label: 'You ring them', who: 'you' },
    { label: 'They donate with you', who: 'in person, at your place', handoff: true },
  ],
}

/** Hair, offered by the donor to a partner organisation they pick. */
export const HAIR_FLOW: FlowStep[] = [
  { label: 'Fill in the hair form', who: 'length, condition, a photo if you like' },
  { label: 'Choose a partner organisation', who: 'you' },
  { label: 'They check it', who: 'the partner decides' },
  { label: 'Accepted', who: 'with instructions for sending it' },
  { label: 'You send or bring it', who: 'as the partner asks' },
  { label: 'They make wigs with it', who: 'the partner — not this app', handoff: true },
]

/** Breast milk, in the four steps the spec draws. */
export const MILK_FLOW: FlowStep[] = [
  { label: 'Mother', who: 'with surplus milk' },
  { label: 'Eligibility & consent', who: 'seven points, all confirmed' },
  { label: 'LMC / CLMC screening', who: 'the centre tests — not this app' },
  { label: 'Donation', who: 'at the centre', handoff: true },
]

/** A partner organisation's side of a hair or milk offer. */
export const PARTNER_FLOW: FlowStep[] = [
  { label: 'An offer arrives', who: 'hair details or milk eligibility' },
  { label: 'You check it', who: 'mark it in review' },
  { label: 'Accept, or decline with a reason', who: 'the donor sees either' },
  { label: 'You ring the donor', who: 'their number is on the offer' },
  { label: 'Mark it received', who: 'when it reaches you' },
  { label: 'The donation is yours to use', who: 'screening and use are yours', handoff: true },
]

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
  { label: 'You upload it', who: 'photos and honest answers' },
  { label: 'An organisation accepts it', who: 'verified, nearby, first wins' },
  { label: 'A delivery partner is assigned', who: 'or a courier' },
  { label: 'It is picked up', who: 'you read your code out' },
  { label: 'It reaches the organisation', who: 'they read theirs out' },
  { label: 'They tell you it was used', who: 'with a photo' },
]

/**
 * The delivery partner's own journey (the `volunteer` role).
 *
 * GOODS_FLOW is written from the donor's side — "you upload it" — and handing
 * that to a delivery partner told them their journey starts with something they
 * never do. Same lane, different person, so it needs its own words.
 */
export const VOLUNTEER_FLOW: FlowStep[] = [
  { label: 'An admin verifies you', who: 'ID and a selfie' },
  { label: 'You see pickups near you', who: 'inside the distance you set' },
  { label: 'You take one', who: 'you' },
  { label: 'You collect it', who: 'the donor reads their code to you' },
  { label: 'You deliver it', who: 'the organisation reads theirs' },
  { label: 'It is out of your hands', who: 'they confirm it with the donor', handoff: true },
]

/** Which journeys a role can see, and in what order. */
export function flowsFor(role: Role): { title: string; steps: FlowStep[] }[] {
  if (role === 'donor' || role === 'admin') {
    return [
      { title: 'Blood', steps: HEALTH_FLOW.donor },
      { title: 'Hair', steps: HAIR_FLOW },
      { title: 'Breast milk', steps: MILK_FLOW },
      { title: 'Material — things you no longer need', steps: GOODS_FLOW },
    ]
  }
  if (role === 'ngo') {
    return [
      { title: 'Blood alerts, for hospitals', steps: HEALTH_FLOW.ngo },
      { title: 'Hair and breast milk offers, for partners', steps: PARTNER_FLOW },
      { title: 'Accepting material from the wall', steps: GOODS_FLOW },
    ]
  }
  return [{ title: 'Delivery partner — pickup and delivery of materials', steps: VOLUNTEER_FLOW }]
}
