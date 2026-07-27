import { z } from 'zod'

export const categorySchema = z.enum(['clothes', 'books', 'toys'])
export const conditionSchema = z.enum(['like_new', 'good', 'usable'])

export type Category = z.infer<typeof categorySchema>
export type Condition = z.infer<typeof conditionSchema>

/**
 * The condition gates from PLAN.md §M2. These are the single control that stops
 * the platform being used as a dump, so they are hard yes/no blocks, not
 * advisory copy. Any "no" fails submission with the `blocks` reason shown.
 */
export interface ConditionGate {
  key: string
  question: string
  blocks: string
}

export const CONDITION_GATES: Record<Category, ConditionGate[]> = {
  clothes: [
    {
      key: 'washed',
      question: 'Is everything clean and washed?',
      blocks: 'Unwashed clothes are thrown away, not given out. Please wash them and post again.',
    },
    {
      key: 'undamaged',
      question: 'Is it free of tears, stains and missing buttons?',
      blocks:
        'Damaged clothing costs the NGO more to sort than it is worth. Please repair or recycle it.',
    },
    {
      key: 'complete_pairs',
      question: 'Are all pairs and sets complete?',
      blocks:
        'Single shoes and incomplete sets cannot be given to anyone. Please complete the set.',
    },
    {
      key: 'would_wear',
      question: 'Would you still wear this yourself?',
      blocks: 'If you would not wear it, the person receiving it will not either.',
    },
  ],
  books: [
    {
      key: 'complete',
      question: 'Are all pages present and readable?',
      blocks: 'A book with missing pages cannot be read. Please recycle it instead.',
    },
    {
      key: 'dry',
      question: 'Is it free of damp, mould and insect damage?',
      blocks: 'Damp or mouldy books spoil everything stored beside them.',
    },
    {
      key: 'binding',
      question: 'Is the spine or binding intact?',
      blocks: 'A book that falls apart on first use is not usable. Please recycle it.',
    },
  ],
  toys: [
    {
      key: 'all_pieces',
      question: 'Are all the pieces present?',
      blocks: 'An incomplete toy or puzzle disappoints the child who receives it.',
    },
    {
      key: 'clean',
      question: 'Has it been cleaned?',
      blocks: 'Toys go to small children. Please clean it and post again.',
    },
    {
      key: 'safe',
      question: 'Is it unbroken, with no sharp edges or loose small parts?',
      blocks: 'A broken toy is a safety risk for a small child. Please recycle it.',
    },
    {
      key: 'battery',
      question: 'If it needs batteries, does it work?',
      blocks: 'A toy that does not switch on cannot be given away. Please repair it first.',
    },
  ],
}

/** Every gate for the chosen category must be answered `true`. */
export const conditionChecklistSchema = z.record(z.string(), z.boolean())

export const donationDraftSchema = z
  .object({
    title: z.string().trim().min(3, 'Give it a short name').max(120),
    description: z.string().trim().max(2000).optional(),
    category: categorySchema,
    quantity: z.number().int().min(1, 'At least one').max(500),
    condition: conditionSchema,
    conditionChecklist: conditionChecklistSchema,
    pickupAddress: z.string().trim().min(8, 'Enter the pickup address').max(500),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    photoPaths: z
      .array(z.string().min(1))
      .min(1, 'Add at least one photo')
      .max(5, 'Five photos is the maximum'),
  })
  .superRefine((value, ctx) => {
    const gates = CONDITION_GATES[value.category]
    for (const gate of gates) {
      if (value.conditionChecklist[gate.key] !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditionChecklist', gate.key],
          message: gate.blocks,
        })
      }
    }
  })

export type DonationDraft = z.infer<typeof donationDraftSchema>

export const DONATION_STATUSES = [
  'posted',
  'claimed',
  'scheduled',
  'in_transit',
  'received',
  'acknowledged',
  'cancelled',
  'rejected',
] as const

export type DonationStatus = (typeof DONATION_STATUSES)[number]
