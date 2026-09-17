import type { BadgeProps } from '@/components/ui/badge'
import type { OfferStatus } from '@/lib/validation/health'

/** One colour per offer state, shared by the donor, partner and admin views. */
export const OFFER_VARIANT: Record<OfferStatus, BadgeProps['variant']> = {
  submitted: 'muted',
  in_review: 'tag',
  accepted: 'success',
  declined: 'destructive',
  completed: 'success',
  withdrawn: 'muted',
}
