import { useQuery } from '@tanstack/react-query'
import { Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/dates'
import { healthApi } from '@/lib/health-client'
import { URGENCY_LABEL, type HealthCategory } from '@/lib/validation/health'

/**
 * Organisations currently asking for this kind of donation.
 *
 * The other half of the same relationship as an offer: a donor can send hair
 * to a partner unprompted, and a partner can say it is short. Nothing here
 * claims a donor for a requirement — choosing who to offer to stays the
 * donor's, in the form below.
 */
export function Requirements({ category }: { category: HealthCategory }) {
  const { data, isLoading } = useQuery({
    queryKey: ['health', 'nearby'],
    queryFn: healthApi.nearby,
  })

  if (isLoading) return <Skeleton className="h-20 w-full" />

  const requests = (data?.requests ?? []).filter((r) => r.category === category)
  if (requests.length === 0) return null

  return (
    <section className="hairline space-y-2 rounded-sm border-primary/40 bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-display-sm">
        <Megaphone className="size-4 text-primary" aria-hidden /> Asked for right now
      </h2>
      <ul className="space-y-2" aria-label="Open requirements">
        {requests.map((r) => (
          <li key={r.id} className="text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.institution}</span>
              <Badge variant={r.urgency === 'routine' ? 'muted' : 'destructive'}>
                {URGENCY_LABEL[r.urgency]}
              </Badge>
              <span className="text-muted-foreground">
                {r.donors_needed} {r.donors_needed === 1 ? 'donor' : 'donors'} needed
              </span>
            </p>
            {r.note ? <p className="text-muted-foreground">{r.note}</p> : null}
            <p className="font-mono text-xs text-muted-foreground">
              {r.address}
              {r.distance_km !== null ? ` · ${r.distance_km} km away` : ''} · asked{' '}
              {formatRelative(r.created_at)}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Choose them in the form below if you would like to offer.
      </p>
    </section>
  )
}
