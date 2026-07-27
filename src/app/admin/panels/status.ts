/** Shared badge mapping so a status never renders two different colours. */
export const STATUS_VARIANT: Record<
  string,
  'tag' | 'success' | 'destructive' | 'muted' | 'outline'
> = {
  // verification
  verified: 'success',
  pending: 'muted',
  rejected: 'destructive',
  suspended: 'destructive',
  // donation
  posted: 'tag',
  claimed: 'tag',
  scheduled: 'tag',
  in_transit: 'tag',
  received: 'success',
  acknowledged: 'success',
  cancelled: 'muted',
}
