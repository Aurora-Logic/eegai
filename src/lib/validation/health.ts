import { z } from 'zod'

/**
 * The health-donation lane, per the developer brief.
 *
 * Shared by the API and the forms so a rule is written once. Nothing here
 * encodes medical logic — brief §6 forbids eligibility checks, and a blood
 * group is a label the donor states about themselves, never something this
 * product judges.
 */

export const HEALTH_CATEGORIES = ['blood', 'hair', 'breast_milk'] as const
export type HealthCategory = (typeof HEALTH_CATEGORIES)[number]

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
export type BloodGroup = (typeof BLOOD_GROUPS)[number]

export const URGENCIES = ['routine', 'urgent', 'critical'] as const
export type Urgency = (typeof URGENCIES)[number]

/** What a donor sees in the picker, in the brief's own words. */
export const CATEGORY_LABEL: Record<HealthCategory, string> = {
  blood: 'Blood',
  hair: 'Hair',
  breast_milk: 'Breast milk',
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  routine: 'Routine',
  urgent: 'Urgent',
  critical: 'Critical',
}

/**
 * The version of the consent text a donor agreed to.
 *
 * Stored with the grant. Raise it when the wording changes and every donor is
 * asked again — a policy that changes silently is not consent (brief §5).
 */
export const CONSENT_VERSION = 1

export const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'] as const
export type Gender = (typeof GENDERS)[number]

export const GENDER_LABEL: Record<Gender, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

/**
 * The donor's registration. The blood fields are what the donor-module spec
 * lists for a blood donor, with blood type compulsory; they are stored and
 * shown to a hospital after the donor says Available, and nothing is computed
 * from them.
 */
export const donorHealthProfileSchema = z
  .object({
    categories: z.array(z.enum(HEALTH_CATEGORIES)).max(3),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
    notify: z.boolean(),
    shareLocation: z.boolean(),
    age: z.coerce.number().int().min(1).max(120).nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    // ISO date. Checked against today here and again in the database.
    lastBloodDonation: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker')
      .nullable()
      .optional()
      .refine((v) => !v || v <= new Date().toISOString().slice(0, 10), {
        message: 'That date is in the future',
      }),
    available: z.boolean().default(true),
  })
  .refine((v) => !v.categories.includes('blood') || Boolean(v.bloodGroup), {
    message: 'Your blood group is needed to register as a blood donor',
    path: ['bloodGroup'],
  })

/**
 * What an organisation needs: blood, hair or breast milk.
 *
 * Both directions exist at once. An organisation may say it needs hair, and a
 * donor may offer hair without being asked — the first is this, the second is
 * an offer. Only blood has to name a group: "we need blood" would page every
 * donor in the city for a requirement most of them cannot meet.
 *
 * "Units required" is carried in donorsNeeded — one donor, one unit — so the
 * column the rest of the lane already counts against is the one the
 * notification shows.
 */
export const healthRequestSchema = z
  .object({
    category: z.enum(HEALTH_CATEGORIES, {
      errorMap: () => ({ message: 'Choose what you need' }),
    }),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
    urgency: z.enum(URGENCIES).default('routine'),
    donorsNeeded: z.coerce.number().int().min(1).max(500),
    note: z.string().trim().max(500).optional(),
    expiresInHours: z.coerce.number().int().min(1).max(720).default(72),
  })
  .refine((v) => v.category !== 'blood' || Boolean(v.bloodGroup), {
    message: 'Choose the blood group you need',
    path: ['bloodGroup'],
  })

export type HealthRequestInput = z.infer<typeof healthRequestSchema>

// ---------------------------------------------------------------------------
// Hair and breast milk, offered by the donor
// ---------------------------------------------------------------------------

/**
 * The partner organisation's criteria, as the spec words them.
 *
 * Shown beside the form. Only "clean and completely dry" is enforced — the
 * spec says "must" for that one and "may not be accepted, depending on the
 * partner organisation" for the rest, which makes them the organisation's call.
 */
/**
 * The floor for a hair offer, refused below rather than warned about.
 *
 * Partners prefer 10–12 inches, but 6 is the length below which nothing can be
 * made at all, so it is the one hair rule the app enforces instead of leaving
 * to the partner. Checked in the database too.
 */
export const HAIR_MIN_INCHES = 6

export const HAIR_CRITERIA = [
  'Minimum length: 6 inches. Below this it cannot be accepted.',
  'Partners usually prefer 10–12 inches, depending on the organisation.',
  'Hair must be clean and completely dry.',
  'Secure it in a ponytail or braid with rubber bands before cutting.',
  'Cut above the upper rubber band so the hair stays bundled.',
  'Hair collected from the floor generally cannot be used.',
  'Bleached, permanently or semi-permanently dyed, or heavily chemically treated hair may not be accepted, depending on the partner organisation.',
  'Straight, curly, black, brown and other natural textures may be accepted, depending on the organisation.',
] as const

export const hairOfferSchema = z.object({
  ngoId: z.string().uuid('Choose a partner organisation'),
  lengthInches: z.coerce
    .number({ invalid_type_error: 'Enter the length in inches' })
    .min(HAIR_MIN_INCHES, `Hair must be at least ${HAIR_MIN_INCHES} inches to be accepted`)
    .max(60, 'That is longer than 60 inches'),
  cleanAndDry: z.literal(true, {
    errorMap: () => ({ message: 'Hair must be clean and completely dry' }),
  }),
  tied: z.boolean(),
  natural: z.boolean(),
  chemicallyTreated: z.boolean(),
  photoPath: z.string().max(300).nullable().optional(),
})

export type HairOfferInput = z.infer<typeof hairOfferSchema>

/**
 * What the partner might hesitate over, so the donor hears it before cutting
 * rather than after. Warnings, not refusals — see HAIR_CRITERIA.
 */
export function hairWarnings(v: {
  lengthInches?: number | null
  tied?: boolean | null
  natural?: boolean | null
  chemicallyTreated?: boolean | null
}): string[] {
  const out: string[] = []
  if (
    typeof v.lengthInches === 'number' &&
    v.lengthInches >= HAIR_MIN_INCHES &&
    v.lengthInches < 10
  ) {
    out.push('Most partners look for at least 10–12 inches.')
  }
  if (v.tied === false)
    out.push('Tie it in a ponytail or braid before cutting, or it cannot be bundled.')
  if (v.natural === false || v.chemicallyTreated === true) {
    out.push('Coloured or chemically treated hair may not be accepted — the partner decides.')
  }
  return out
}

/**
 * The breast-milk eligibility points, in the spec's order. Every one must be
 * confirmed. They are the donor's own declaration: the Lactation Management
 * Centre does the screening, and this app judges nothing.
 */
export const MILK_ELIGIBILITY = [
  { key: 'lactating', label: 'I am a lactating mother.' },
  { key: 'goodHealth', label: 'I am in good health.' },
  {
    key: 'surplus',
    label: "I have surplus expressed breast milk after meeting my own baby's needs.",
  },
  { key: 'voluntary', label: 'I am donating voluntarily.' },
  { key: 'informedConsent', label: 'I give my informed consent.' },
  { key: 'screening', label: "I am willing to undergo the milk bank's screening and testing." },
  {
    key: 'throughCentre',
    label:
      'I will donate through a Lactation Management Centre (LMC/CLMC), not by direct mother-to-mother exchange.',
  },
] as const

export type MilkKey = (typeof MILK_ELIGIBILITY)[number]['key']

const mustConfirm = z.literal(true, {
  errorMap: () => ({ message: 'Every point must be confirmed' }),
})

export const milkOfferSchema = z.object({
  ngoId: z.string().uuid('Choose a Lactation Management Centre'),
  lactating: mustConfirm,
  goodHealth: mustConfirm,
  surplus: mustConfirm,
  voluntary: mustConfirm,
  informedConsent: mustConfirm,
  screening: mustConfirm,
  throughCentre: mustConfirm,
})

export type MilkOfferInput = z.infer<typeof milkOfferSchema>

export const OFFER_STATUSES = [
  'submitted',
  'in_review',
  'accepted',
  'collecting',
  'received',
  'completed',
  'declined',
  'withdrawn',
] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

/**
 * The order the organisation moves through. Declined and withdrawn are off it.
 *
 * Mirrors app.offer_rank in the database, which is what actually refuses a
 * backwards step.
 */
export const OFFER_CHAIN = [
  'submitted',
  'in_review',
  'accepted',
  'collecting',
  'received',
  'completed',
] as const

export function offerRank(status: OfferStatus): number {
  const index = OFFER_CHAIN.indexOf(status as (typeof OFFER_CHAIN)[number])
  return index < 0 ? 0 : index + 1
}

/** What the organisation's next step is called, or null at the end. */
export function nextStatus(status: OfferStatus): OfferStatus | null {
  const index = OFFER_CHAIN.indexOf(status as (typeof OFFER_CHAIN)[number])
  if (index < 0 || index >= OFFER_CHAIN.length - 1) return null
  return OFFER_CHAIN[index + 1] as OfferStatus
}

/**
 * One set of states, two vocabularies. A milk centre screens and a donation
 * follows; a hair partner checks and receives. Same machine, the words each
 * side would actually use.
 */
export const OFFER_STATUS_LABEL: Record<HealthCategory, Record<OfferStatus, string>> = {
  hair: {
    submitted: 'Offer sent',
    in_review: 'Organisation checking',
    accepted: 'Accepted',
    collecting: 'Collection or submission',
    received: 'Received',
    completed: 'Completed',
    declined: 'Not accepted',
    withdrawn: 'Withdrawn',
  },
  breast_milk: {
    submitted: 'Offer sent',
    in_review: 'Screening in progress',
    accepted: 'Screening completed — eligible',
    collecting: 'Donation at the centre',
    received: 'Received',
    completed: 'Completed',
    declined: 'Not this time',
    withdrawn: 'Withdrawn',
  },
  // The brief is explicit that a donor is told "donation completed" and
  // "hospital confirmed" rather than "received" — nobody receives a person.
  blood: {
    submitted: 'Available — offer sent',
    in_review: 'Hospital screening',
    accepted: 'Eligible — accepted',
    collecting: 'Donation at the hospital',
    received: 'Hospital confirmed',
    completed: 'Donation completed',
    declined: 'Not this time',
    withdrawn: 'Withdrawn',
  },
}

/** A donor offering blood to a hospital of their choosing, outside any alert. */
export const bloodOfferSchema = z.object({
  ngoId: z.string().uuid('Choose a hospital or blood centre'),
  note: z.string().trim().max(500).optional(),
})
