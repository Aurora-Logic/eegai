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

export const donorHealthProfileSchema = z.object({
  categories: z.array(z.enum(HEALTH_CATEGORIES)).max(3),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  notify: z.boolean(),
  shareLocation: z.boolean(),
})

export const healthRequestSchema = z
  .object({
    category: z.enum(HEALTH_CATEGORIES),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
    urgency: z.enum(URGENCIES).default('routine'),
    donorsNeeded: z.coerce.number().int().min(1).max(500),
    // The brief names ~10km. The ceiling stops somebody quietly broadcasting
    // to a whole state; the floor stops a request nobody can see.
    radiusKm: z.coerce.number().int().min(1).max(50).default(10),
    note: z.string().trim().max(500).optional(),
    expiresInHours: z.coerce.number().int().min(1).max(720).default(72),
  })
  .refine((v) => v.category === 'blood' || !v.bloodGroup, {
    message: 'A blood group only applies to a blood request',
    path: ['bloodGroup'],
  })

export type HealthRequestInput = z.infer<typeof healthRequestSchema>
