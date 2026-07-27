import { useState, type ReactNode } from 'react'
import { ImageOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { photoUrl } from '@/lib/api'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { DonationStatus, Category, Condition } from '@/lib/validation/donation'

export interface BrickDonation {
  id: string
  title: string
  category: Category
  condition: Condition
  quantity: number
  pincode: string | null
  status: DonationStatus
  delivery_method?: 'courier' | 'volunteer' | null
  photos: { path: string; sortOrder: number }[]
}

const CONDITION_LABEL: Record<Condition, string> = {
  like_new: 'like new',
  good: 'good',
  usable: 'usable',
}

const STATUS_VARIANT: Partial<
  Record<DonationStatus, 'tag' | 'success' | 'destructive' | 'muted' | 'outline'>
> = {
  received: 'success',
  acknowledged: 'success',
  rejected: 'destructive',
  cancelled: 'muted',
}

/**
 * One item, pinned to the plaster. Sized by its photo's aspect ratio so the
 * masonry column has genuinely varied heights (PLAN.md §8).
 *
 * When claimed, the brick lifts off the wall and the gap fills with plaster.
 * That transform is the only animation in the product; under
 * prefers-reduced-motion it fades instead.
 */
export function Brick({
  donation,
  onClaim,
  isClaiming,
  lifting,
  showStatus,
  footer,
}: {
  donation: BrickDonation
  onClaim?: (id: string) => void
  isClaiming?: boolean
  lifting?: boolean
  showStatus?: boolean
  /** Role-specific actions rendered under the tile — delivery choice, etc. */
  footer?: ReactNode
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const photo = donation.photos[0]

  return (
    <article
      className={cn(
        'hairline mb-4 break-inside-avoid overflow-hidden rounded-sm bg-card',
        lifting && 'animate-brick-lift motion-reduce:animate-brick-fade',
      )}
    >
      <div className="relative bg-muted">
        {photo && !imageFailed ? (
          <img
            src={photoUrl(photo.path)}
            alt={`${donation.title} — ${CONDITION_LABEL[donation.condition]} condition`}
            className="block w-full"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          // A brick with no visible photo still has to hold its place on the
          // wall rather than collapsing the column.
          <div className="grid aspect-[4/3] place-items-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
            <span className="sr-only">Photo unavailable</span>
          </div>
        )}

        {/* The kraft tag, pinned to the corner of the tile. */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Badge>{donation.category}</Badge>
          <Badge>{CONDITION_LABEL[donation.condition]}</Badge>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <h3 className="font-display text-display-sm leading-tight">{donation.title}</h3>

        <p className="font-mono text-xs text-muted-foreground">
          {donation.quantity > 1 ? `×${donation.quantity} · ` : ''}
          {donation.pincode ?? 'Coimbatore'}
        </p>

        {showStatus ? (
          <Badge variant={STATUS_VARIANT[donation.status] ?? 'outline'}>
            {donation.status.replace('_', ' ')}
          </Badge>
        ) : null}

        {footer}

        {onClaim ? (
          <Button
            className="w-full"
            onClick={() => onClaim(donation.id)}
            disabled={isClaiming}
            aria-label={`${t('action.claim')} — ${donation.title}`}
          >
            {isClaiming ? 'Claiming…' : t('action.claim')}
          </Button>
        ) : null}
      </div>
    </article>
  )
}
