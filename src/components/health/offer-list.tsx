import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/dates'
import { OFFER_VARIANT } from '@/lib/offer-status'
import { healthApi, type OfferCategory } from '@/lib/health-client'
import { OFFER_STATUS_LABEL } from '@/lib/validation/health'

/**
 * The donor's own offers of one kind, newest first.
 *
 * The organisation's contact details are shown from the moment the offer is
 * sent: the donor chose that organisation, so its number is not a disclosure,
 * and "ring them" is the natural next step whatever the status says.
 */
export function OfferList({ category }: { category: OfferCategory }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['health', 'offers', 'mine'],
    queryFn: healthApi.myOffers,
  })
  const withdraw = useMutation({
    mutationFn: healthApi.withdrawOffer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health', 'offers'] }),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />

  const offers = (data?.offers ?? []).filter((o) => o.category === category)
  if (offers.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
  }

  return (
    <ul className="space-y-3" aria-label="Your offers">
      {offers.map((o) => (
        <li key={o.offer_id} className="hairline rounded-sm bg-card p-4">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{o.organisation}</span>
            <Badge variant={OFFER_VARIANT[o.status]}>
              {OFFER_STATUS_LABEL[category][o.status]}
            </Badge>
          </p>
          {o.org_note ? <p className="mt-2 text-sm">“{o.org_note}”</p> : null}
          {o.address ? (
            <p className="mt-2 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{o.address}</span>
            </p>
          ) : null}
          {o.contact_phone ? (
            <p className="mt-1.5 flex items-center gap-2 text-sm">
              <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`tel:${o.contact_phone}`} className="underline underline-offset-4">
                {o.contact_phone}
              </a>
            </p>
          ) : null}
          {o.visit_instructions && o.status === 'accepted' ? (
            <p className="mt-2 text-sm text-muted-foreground">{o.visit_instructions}</p>
          ) : null}
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            sent {formatRelative(o.created_at)}
            {o.decided_at ? ` · updated ${formatRelative(o.decided_at)}` : ''}
          </p>
          {o.status === 'submitted' || o.status === 'in_review' || o.status === 'accepted' ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate(o.offer_id)}
            >
              Withdraw
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
