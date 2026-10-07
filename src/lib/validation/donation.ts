import { z } from 'zod'

/**
 * The thirteen material categories, in the spec's order.
 *
 * The old six are still values of the database enum because Postgres cannot
 * drop one, and every row was migrated onto this list (migration 029). Nothing
 * reads them any more; this array is what the product offers.
 *
 * There is deliberately no "bags and accessories": a bag belongs to whatever it
 * is for — a school bag is stationery, a storage bag is household — which keeps
 * the wall about donation rather than resale.
 */
export const CATEGORIES = [
  'clothing',
  'footwear',
  'books',
  'stationery',
  'art_craft',
  'food_groceries',
  'toiletries',
  'kitchen',
  'household_bedding',
  'sports',
  'toys_games',
  'cleaning',
  'baby_child',
] as const

export const categorySchema = z.enum(CATEGORIES)
export const conditionSchema = z.enum(['like_new', 'good', 'usable'])

export type Category = z.infer<typeof categorySchema>
export type Condition = z.infer<typeof conditionSchema>

/** What belongs in each, in the donor's words. Shown beside the choice. */
export const CATEGORY_EXAMPLES: Record<Category, string> = {
  clothing: 'Shirts, T-shirts, pants, dresses, sarees, jackets, uniforms',
  footwear: 'Shoes, sandals, slippers',
  books: 'Textbooks, story books, children’s books, reference books',
  stationery: 'Notebooks, pens, pencils, erasers, geometry boxes, school bags',
  art_craft: 'Crayons, paints, brushes, drawing books, craft paper, DIY materials',
  food_groceries: 'Rice, dal, atta, oil, sugar, spices, cereals, packaged food',
  toiletries: 'Soap, shampoo, toothpaste, toothbrush, sanitary pads, sanitiser',
  kitchen: 'Plates, cups, spoons, cooking vessels, storage containers, water bottles',
  household_bedding: 'Bedsheets, blankets, towels, mats, storage baskets',
  sports: 'Cricket equipment, footballs, badminton rackets, skipping ropes',
  toys_games: 'Toys, puzzles, board games, indoor and outdoor games',
  cleaning: 'Detergent, floor cleaner, toilet cleaner, brooms, mops, cleaning cloths',
  baby_child: 'Baby clothes, diapers, feeding bottles, baby food, baby-care products',
}

/**
 * The condition gates. These are the single control that stops the platform
 * being used as a dump, so a "no" blocks the post and says why.
 *
 * `optional: true` adds Not applicable, for questions that genuinely do not
 * apply to every item in the category — a pencil has no packaging, a skipping
 * rope has no accessories. Nothing in the product selects it for the donor:
 * being allowed to say "this does not apply" is not the same as being answered
 * for, and the difference is the whole value of the gate.
 */
export interface ConditionGate {
  key: string
  question: string
  blocks: string
  /** Not applicable is an allowed answer. Never pre-selected. */
  optional?: boolean
}

/** An answer to a gate: yes, no, or — where allowed — not applicable. */
export type GateAnswer = boolean | 'na'

export const CONDITION_GATES: Record<Category, ConditionGate[]> = {
  clothing: [
    {
      key: 'clean',
      question: 'Is it clean and washed?',
      blocks: 'Unwashed clothes are thrown away, not given out. Please wash them and post again.',
    },
    {
      key: 'wearable',
      question: 'Is it in good wearable condition?',
      blocks: 'If you would not wear it, the person receiving it will not either.',
    },
    {
      key: 'undamaged',
      question: 'Is it free from major tears, stains or damage?',
      blocks:
        'Damaged clothing costs the organisation more to sort than it is worth. Please repair or recycle it.',
    },
  ],
  footwear: [
    {
      key: 'clean',
      question: 'Is it clean?',
      blocks: 'Dirty footwear is thrown away rather than given out. Please clean it first.',
    },
    {
      key: 'usable',
      question: 'Is it in good usable condition?',
      blocks: 'Worn-through footwear cannot be given to anyone. Please recycle it.',
    },
    {
      key: 'undamaged',
      question: 'Is it free from major damage?',
      blocks: 'Broken soles or straps make footwear unwearable. Please recycle it.',
    },
  ],
  books: [
    {
      key: 'good_condition',
      question: 'Is it in good condition?',
      blocks: 'A book that falls apart on first use is not usable. Please recycle it.',
    },
    {
      key: 'complete',
      question: 'Are the pages complete and readable?',
      blocks: 'A book with missing pages cannot be read. Please recycle it instead.',
    },
    {
      key: 'dry',
      question: 'Is it free from mould or major damage?',
      blocks: 'Damp or mouldy books spoil everything stored beside them.',
    },
  ],
  stationery: [
    {
      key: 'unused',
      question: 'Is it unused, or in good usable condition?',
      blocks: 'A half-filled notebook cannot be given to another student.',
    },
    {
      key: 'functional',
      question: 'Is it functional and usable?',
      blocks: 'A broken instrument is useless in an exam hall. Please replace or recycle it.',
      optional: true,
    },
    {
      key: 'clean',
      question: 'Is it clean and suitable for use?',
      blocks: 'Please clean it before posting, or it will be thrown away on arrival.',
    },
  ],
  art_craft: [
    {
      key: 'unused',
      question: 'Is it unused, or in good usable condition?',
      blocks: 'Dried-out or used-up materials cannot be given to a child.',
    },
    {
      key: 'complete',
      question: 'Are the materials complete and usable?',
      blocks: 'An incomplete set disappoints the child who receives it.',
      optional: true,
    },
    {
      key: 'packaging',
      question: 'Is the packaging intact?',
      blocks: 'Opened or spilled materials cannot be handed on safely.',
      optional: true,
    },
  ],
  food_groceries: [
    {
      key: 'sealed',
      question: 'Is it sealed and properly packaged?',
      blocks: 'Only sealed, packaged food can be accepted. Opened packets cannot be given out.',
    },
    {
      key: 'in_date',
      question: 'Is it within the expiry or best-before date?',
      blocks: 'Expired food cannot be given to anyone, and disposing of it costs the organisation.',
    },
    {
      key: 'undamaged',
      question: 'Is the packaging undamaged?',
      blocks: 'Torn or leaking packaging makes food unsafe to hand on.',
    },
    {
      key: 'not_homemade',
      question: 'Is it free from homemade or open food?',
      blocks: 'Homemade and open food cannot be accepted — it cannot be checked or stored safely.',
    },
  ],
  toiletries: [
    {
      key: 'new',
      question: 'Is it new and unopened?',
      blocks: 'Opened toiletries cannot be given to anyone else.',
    },
    {
      key: 'sealed',
      question: 'Is the packaging sealed and undamaged?',
      blocks: 'A broken seal makes it unusable for the person receiving it.',
    },
    {
      key: 'in_date',
      question: 'Is it within the expiry date?',
      blocks: 'Expired products cannot be given out.',
    },
  ],
  kitchen: [
    {
      key: 'clean',
      question: 'Is it clean?',
      blocks: 'Unwashed items are thrown away, not given out. Please clean it first.',
    },
    {
      key: 'usable',
      question: 'Is it in good and usable condition?',
      blocks: 'An item that cannot be used is a disposal cost for the organisation.',
    },
    {
      key: 'undamaged',
      question: 'Is it free from cracks, breaks or major damage?',
      blocks: "A cracked or leaking item is a hazard in someone else's kitchen.",
    },
    {
      key: 'safe',
      question: 'Is it safe to use?',
      blocks: 'Anything unsafe to cook or eat from cannot be passed on.',
    },
  ],
  household_bedding: [
    {
      key: 'clean',
      question: 'Is it clean and hygienic?',
      blocks: 'Unwashed bedding is thrown away, not given out. Please wash it first.',
    },
    {
      key: 'usable',
      question: 'Is it in good and usable condition?',
      blocks: 'Worn-through bedding cannot be given to anyone.',
    },
    {
      key: 'undamaged',
      question: 'Is it free from major damage, stains or tears?',
      blocks: 'Damaged items cost more to sort than they are worth.',
    },
    {
      key: 'no_pests',
      question: 'Is it free from insects or infestation?',
      blocks: 'Infested items ruin everything stored beside them. Please do not send it.',
    },
  ],
  sports: [
    {
      key: 'clean',
      question: 'Is it clean and in good condition?',
      blocks: 'Please clean it before posting, or it will be thrown away on arrival.',
    },
    {
      key: 'functional',
      question: 'Is it functional and usable?',
      blocks: 'Equipment that cannot be played with cannot be given away.',
    },
    {
      key: 'undamaged',
      question: 'Is it free from major damage?',
      blocks: 'Broken equipment is a safety risk. Please recycle it.',
    },
    {
      key: 'complete',
      question: 'Are all essential parts and accessories included?',
      blocks: 'Missing parts make the equipment unusable at the other end.',
      optional: true,
    },
  ],
  toys_games: [
    {
      key: 'clean',
      question: 'Is it clean and safe?',
      blocks: 'Toys go to small children. Please clean it and post again.',
    },
    {
      key: 'usable',
      question: 'Is it in good and usable condition?',
      blocks: 'A toy that does not work disappoints the child who receives it.',
    },
    {
      key: 'complete',
      question: 'Are all essential pieces and components included?',
      blocks: 'An incomplete toy or puzzle disappoints the child who receives it.',
      optional: true,
    },
    {
      key: 'undamaged',
      question: 'Is it free from major damage?',
      blocks: 'A broken toy is a safety risk for a small child. Please recycle it.',
    },
  ],
  cleaning: [
    {
      key: 'new',
      question: 'Is it new and unopened?',
      blocks: 'Opened cleaning products cannot be handed on safely.',
    },
    {
      key: 'sealed',
      question: 'Is the packaging sealed and undamaged?',
      blocks: 'Leaking containers are unsafe to carry and to store.',
    },
    {
      key: 'in_date',
      question: 'Is it within the expiry or recommended shelf life?',
      blocks: 'Out-of-date products cannot be given out.',
      optional: true,
    },
  ],
  baby_child: [
    {
      key: 'new',
      question: 'Is it new or unused?',
      blocks: 'Used baby products cannot be given to another child.',
    },
    {
      key: 'sealed',
      question: 'Is the packaging sealed and undamaged?',
      blocks: 'A broken seal makes it unsafe for a baby.',
    },
    {
      key: 'in_date',
      question: 'Is it within the expiry or use-by date?',
      blocks: 'Expired baby products cannot be given out.',
      optional: true,
    },
    {
      key: 'safe',
      question: 'Is it age-appropriate and safe to use?',
      blocks: 'Anything unsafe for a child cannot be passed on.',
    },
  ],
}

/**
 * The category an item name points at.
 *
 * Keyword matching on what the donor typed, longest keyword first so "school
 * bag" beats "bag" and "baby clothes" beats "clothes". It is a suggestion the
 * donor can overrule, never a decision: a wrong guess silently filed under the
 * wrong category would reach the wrong organisations.
 *
 * Photographs are not read here. Recognising an object in a picture needs a
 * vision model, and there is none in this app.
 */
const KEYWORDS: Record<string, Category> = {
  // Bags, by what they are for — see the note on CATEGORIES.
  'school bag': 'stationery',
  'college bag': 'stationery',
  'baby bag': 'baby_child',
  'diaper bag': 'baby_child',
  'storage bag': 'household_bedding',
  'shopping bag': 'household_bedding',
  'baby clothes': 'baby_child',
  'baby food': 'baby_child',
  'feeding bottle': 'baby_child',
  diaper: 'baby_child',
  pram: 'baby_child',
  cradle: 'baby_child',

  shirt: 'clothing',
  tshirt: 'clothing',
  't-shirt': 'clothing',
  pant: 'clothing',
  trouser: 'clothing',
  dress: 'clothing',
  saree: 'clothing',
  sari: 'clothing',
  jacket: 'clothing',
  sweater: 'clothing',
  uniform: 'clothing',
  kurta: 'clothing',
  frock: 'clothing',
  clothes: 'clothing',
  clothing: 'clothing',
  jeans: 'clothing',

  shoe: 'footwear',
  sandal: 'footwear',
  slipper: 'footwear',
  chappal: 'footwear',
  footwear: 'footwear',
  boot: 'footwear',

  book: 'books',
  textbook: 'books',
  novel: 'books',
  dictionary: 'books',

  notebook: 'stationery',
  pen: 'stationery',
  pencil: 'stationery',
  eraser: 'stationery',
  'geometry box': 'stationery',
  stationery: 'stationery',
  ruler: 'stationery',
  sharpener: 'stationery',
  calculator: 'stationery',

  crayon: 'art_craft',
  paint: 'art_craft',
  brush: 'art_craft',
  'drawing book': 'art_craft',
  'craft paper': 'art_craft',
  craft: 'art_craft',
  sketch: 'art_craft',

  rice: 'food_groceries',
  dal: 'food_groceries',
  atta: 'food_groceries',
  flour: 'food_groceries',
  oil: 'food_groceries',
  sugar: 'food_groceries',
  spice: 'food_groceries',
  cereal: 'food_groceries',
  grocery: 'food_groceries',
  biscuit: 'food_groceries',
  'packaged food': 'food_groceries',

  soap: 'toiletries',
  shampoo: 'toiletries',
  toothpaste: 'toiletries',
  toothbrush: 'toiletries',
  'sanitary pad': 'toiletries',
  sanitiser: 'toiletries',
  sanitizer: 'toiletries',
  toiletries: 'toiletries',

  plate: 'kitchen',
  cup: 'kitchen',
  spoon: 'kitchen',
  vessel: 'kitchen',
  cooker: 'kitchen',
  'water bottle': 'kitchen',
  container: 'kitchen',
  utensil: 'kitchen',
  pan: 'kitchen',
  kadai: 'kitchen',
  tumbler: 'kitchen',

  bedsheet: 'household_bedding',
  blanket: 'household_bedding',
  towel: 'household_bedding',
  mat: 'household_bedding',
  pillow: 'household_bedding',
  curtain: 'household_bedding',
  basket: 'household_bedding',
  quilt: 'household_bedding',

  cricket: 'sports',
  football: 'sports',
  badminton: 'sports',
  racket: 'sports',
  'skipping rope': 'sports',
  bat: 'sports',
  ball: 'sports',
  carrom: 'sports',

  toy: 'toys_games',
  puzzle: 'toys_games',
  'board game': 'toys_games',
  doll: 'toys_games',
  lego: 'toys_games',
  game: 'toys_games',

  detergent: 'cleaning',
  'floor cleaner': 'cleaning',
  'toilet cleaner': 'cleaning',
  broom: 'cleaning',
  mop: 'cleaning',
  'cleaning cloth': 'cleaning',
  phenyl: 'cleaning',
}

const KEYWORDS_BY_LENGTH = Object.entries(KEYWORDS).sort((a, b) => b[0].length - a[0].length)

export function detectCategory(title: string): Category | null {
  const text = title.toLowerCase()
  if (text.trim().length < 2) return null
  for (const [keyword, category] of KEYWORDS_BY_LENGTH) {
    if (text.includes(keyword)) return category
  }
  return null
}

/** Yes, no, or not applicable where the gate allows it. */
export const conditionChecklistSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.literal('na')]),
)

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
      const answer = value.conditionChecklist[gate.key]
      // Not applicable passes only where the gate offers it; everywhere else
      // the answer has to be yes, and an unanswered gate is not a yes.
      const ok = answer === true || (gate.optional === true && answer === 'na')
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditionChecklist', gate.key],
          message: answer === undefined ? `Answer: ${gate.question}` : gate.blocks,
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
