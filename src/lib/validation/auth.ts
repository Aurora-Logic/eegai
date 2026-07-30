import { z } from 'zod'

/**
 * Shared by the React forms and the API routes. One definition means a rule can
 * never be enforced on the client but forgotten on the server.
 */

/**
 * Accepts the shapes people actually type and stores the bare 10 digits.
 *
 * The country code is only stripped when the length says it is one. Naively
 * removing a leading "91" corrupts every real number that starts with 91 —
 * 9100000001 is a perfectly ordinary Indian mobile.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '')

  if (digits.startsWith('+91') && digits.length === 13) return digits.slice(3)
  if (digits.startsWith('0091') && digits.length === 14) return digits.slice(4)
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1)

  return digits
}

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalisePhone)
  .pipe(
    z
      .string()
      .regex(/^[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number starting 6, 7, 8 or 9'),
  )

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'That is longer than 128 characters')
  // Deliberately no symbol/uppercase rules. Length is what matters, and
  // composition rules push people towards Password1! and a sticky note.
  .refine((value) => value.trim().length > 0, 'Enter a password')

export const roleSchema = z.enum(['donor', 'ngo', 'volunteer'], {
  errorMap: () => ({ message: 'Choose how you want to use the wall' }),
})

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your name').max(120),
    phone: phoneSchema,
    password: passwordSchema,
    role: roleSchema,
    email: z.string().trim().email('That email address is not valid').optional().or(z.literal('')),
    // Where the organisation is. Optional in the shape, required by the refine
    // below for NGOs only — a donor gives an address per item, and a volunteer
    // sets a radius later.
    address: z.string().trim().max(500).optional().or(z.literal('')),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{6}$|^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode')
      .optional()
      .or(z.literal('')),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .superRefine((value, ctx) => {
    // An organisation without a location does not merely have a gap in its
    // record: the wall policy reads `n.lat is null or distance <= radius`, so a
    // null location makes that clause true and the organisation sees every item
    // in the city. Refuse it at the form as well as in register_user.
    if (value.role !== 'ngo') return

    if (!value.pincode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pincode'],
        message: 'Choose the area your organisation works from.',
      })
    }
    if (!value.address || value.address.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'Enter the address a volunteer should deliver to.',
      })
    }
  })

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Enter your password'),
})

/**
 * What anyone may change about themselves.
 *
 * Phone is deliberately absent. It is the login identity and the number a
 * volunteer rings from a doorstep — changing it silently would lock somebody out
 * of their own account and send a volunteer to a dead line. An admin does it, so
 * there is a person and a trail behind the change.
 *
 * Role is absent for the same reason it always has been: guard_role_change
 * refuses it from anyone but an admin.
 */
export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter a name').max(120).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode')
    .optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),

  // Organisation-only. Ignored by the route for any other role.
  address: z.string().trim().max(500).optional(),
  contactPerson: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  isAccepting: z.boolean().optional(),
  acceptsCategories: z.array(z.string()).min(1, 'Accept at least one category').optional(),

  // Volunteer-only.
  serviceRadiusKm: z.number().int().min(1).max(50).optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
