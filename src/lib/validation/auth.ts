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

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
  phone: phoneSchema,
  password: passwordSchema,
  role: roleSchema,
  email: z.string().trim().email('That email address is not valid').optional().or(z.literal('')),
})

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Enter your password'),
})

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode')
    .optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
