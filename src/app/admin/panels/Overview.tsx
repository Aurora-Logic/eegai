import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Metrics {
  donations_total: number
  completed: number
  on_the_wall: number
  in_flight: number
  rejected: number
  cancelled: number
  ngos_pending: number
  ngos_verified: number
  volunteers_pending: number
  volunteers_verified: number
  donors: number
  notifications_failed: number
  median_hours_to_complete: string | null
  institutions: number
  needs_total: number
  needs_open: number
  needs_fulfilled: number
  offers: number
  consented_donors: number
  needs_unanswered: number
  reports_open: number
  deletions_open: number
}

function Tile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'good' | 'warn'
}) {
  return (
    <div className="hairline rounded-sm bg-card p-4">
      <span className="block text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'mt-1 block font-display text-display-md',
          tone === 'good' && 'text-success',
          tone === 'warn' && 'text-destructive',
        )}
      >
        {value}
      </span>
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

export function Overview() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: () => api.get<{ metrics: Metrics }>('/admin/metrics'),
  })

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  const m = data.metrics
  const completionRate = m.donations_total ? Math.round((m.completed / m.donations_total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* PLAN.md §1: the success metric is completed donations, not signups.
          It gets the first tile and the only coloured number. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Completed donations"
          value={m.completed}
          hint={`${completionRate}% of everything posted`}
          tone="good"
        />
        <Tile label="On the wall now" value={m.on_the_wall} hint="posted, unclaimed" />
        <Tile label="In flight" value={m.in_flight} hint="claimed through received" />
        <Tile
          label="Median time to complete"
          value={m.median_hours_to_complete ? `${m.median_hours_to_complete}h` : '—'}
          hint="posted to acknowledged"
        />
      </div>

      {/* The health lane asks a different question from the goods wall. There,
          the number that matters is whether a thing arrived; here it is whether
          anybody answered — so an unanswered request is the tile with the
          colour on it. */}
      <div>
        <h2 className="mb-3 font-display text-display-sm">Blood, hair and breast milk</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Requests with no answer"
            value={m.needs_unanswered}
            hint={`of ${m.needs_total} ever posted`}
            tone={m.needs_unanswered > 0 ? 'warn' : 'good'}
          />
          <Tile label="Open right now" value={m.needs_open} hint={`${m.needs_fulfilled} filled`} />
          <Tile label="People who said yes" value={m.offers} hint="not withdrawn" />
          <Tile
            label="Donors signed up"
            value={m.consented_donors}
            hint={`${m.institutions} institutions approved`}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Complaints open"
          value={m.reports_open}
          hint="somebody is waiting to hear back"
          tone={m.reports_open > 0 ? 'warn' : 'default'}
        />
        <Tile
          label="Deletion requests"
          value={m.deletions_open}
          hint="each one expects a phone call"
          tone={m.deletions_open > 0 ? 'warn' : 'default'}
        />
        <Tile
          label="Organisations waiting"
          value={m.ngos_pending}
          hint={`${m.ngos_verified} verified`}
          tone={m.ngos_pending > 0 ? 'warn' : 'default'}
        />
        <Tile
          label="Volunteers waiting"
          value={m.volunteers_pending}
          hint={`${m.volunteers_verified} verified`}
          tone={m.volunteers_pending > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Donors" value={m.donors} />
        <Tile
          label="Failed messages"
          value={m.notifications_failed}
          hint="SMS or WhatsApp not delivered"
          tone={m.notifications_failed > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Rejected on arrival" value={m.rejected} hint="NGO refused the item" />
        <Tile label="Cancelled by donor" value={m.cancelled} />
        <Tile label="Posted, all time" value={m.donations_total} />
      </div>

      {m.ngos_verified < 5 ? (
        <p className="hairline rounded-sm bg-card p-4 text-sm text-muted-foreground">
          The plan assumes five verified organisations before donors are invited. There{' '}
          {m.ngos_verified === 1 ? 'is' : 'are'} {m.ngos_verified}.
        </p>
      ) : null}
    </div>
  )
}
