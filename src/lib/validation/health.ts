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
 * A blood alert. Only blood: hair and breast milk are offered by donors now,
 * so an institution has nothing to request for them.
 *
 * "Units required" is carried in donorsNeeded — one donor, one unit — so the
 * column the rest of the lane already counts against is the one the spec's
 * notification shows.
 */
export const healthRequestSchema = z.object({
  category: z.literal('blood', {
    errorMap: () => ({ message: 'Only blood alerts can be posted' }),
  }),
  bloodGroup: z.enum(BLOOD_GROUPS, {
    errorMap: () => ({ message: 'Choose the blood group you need' }),
  }),
  urgency: z.enum(URGENCIES).default('routine'),
  donorsNeeded: z.coerce.number().int().min(1).max(500),
  note: z.string().trim().max(500).optional(),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(72),
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
export const HAIR_CRITERIA = [
  'Minimum length: preferably 10–12 inches, depending on the partner organisation.',
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
    .min(1, 'Enter the length in inches')
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
  if (typeof v.lengthInches === 'number' && v.lengthInches > 0 && v.lengthInches < 10) {
    out.push('Most partners look for at least 10–12 inches.')
  }
  if (v.tied === false) out.push('Tie it in a ponytail or braid before cutting, or it cannot be bundled.')
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
  'declined',
  'completed',
  'withdrawn',
] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

/**
 * One set of states, two vocabularies. A milk centre screens and a donation
 * follows; a hair partner checks and receives. Same machine, the words each
 * side would actually use.
 */
export const OFFER_STATUS_LABEL: Record<'hair' | 'breast_milk', Record<OfferStatus, string>> = {
  hair: {
    submitted: 'Sent',
    in_review: 'Being checked',
    accepted: 'Accepted',
    declined: 'Not accepted',
    completed: 'Received',
    withdrawn: 'Withdrawn',
  },
  breast_milk: {
    submitted: 'Sent to the centre',
    in_review: 'Being screened',
    accepted: 'Cleared to donate',
    declined: 'Not this time',
    completed: 'Donated',
    withdrawn: 'Withdrawn',
  },
}
