import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { STATUS_VARIANT } from './panels/status'

interface Event {
  id: string
  created_at: string
  event: string
  from_status: string | null
  to_status: string | null
  request_id: string | null
  actor_name: string | null
  actor_role: string | null
}

interface Raw {
  id: string
  created_at: string
  entity: string
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  request_id: string | null
  actor_name: string | null
  actor_role: string | null
}

interface Donation {
  id: string
  title: string
  description: string | null
  category: string
  condition: string
  quantity: number
  status: string
  pickup_address: string | null
  pincode: string | null
  rejected_reason: string | null
  posted_at: string
  donor_name: string
  donor_phone: string | null
  ngo_name: string | null
  condition_checklist: Record<string, boolean>
}

/**
 * The dispute view (PLAN.md §M7). Everything that ever happened to one item,
 * in order, with who did it and the request id that did it.
 *
 * Two levels deliberately: a readable timeline for resolving the argument, and
 * the raw before/after underneath for when the timeline is not enough.
 */
export default function DonationTrail() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'trail', id],
    queryFn: () =>
      api.get<{ donation: Donation; events: Event[]; raw: Raw[] }>(`/admin/donations/${id}/trail`),
  })

  return (
    <AppShell
      title="Item trail"
      subtitle={data?.donation.title}
      actions={
        <Button asChild variant="outline">
          <Link to="/admin">
            <ArrowLeft aria-hidden /> Back to admin
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !data ? (
        <p role="alert" className="text-destructive">
          That item does not exist, or it has been deleted.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <section className="hairline space-y-3 rounded-sm bg-card p-5">
            <h2 className="font-display text-display-sm">{data.donation.title}</h2>
            <p className="flex flex-wrap gap-1">
              <Badge>{data.donation.category}</Badge>
              <Badge>{data.donation.condition.replace('_', ' ')}</Badge>
              <Badge variant="muted">×{data.donation.quantity}</Badge>
              <Badge variant={STATUS_VARIANT[data.donation.status] ?? 'muted'}>
                {data.donation.status.replace('_', ' ')}
              </Badge>
            </p>

            {data.donation.description ? (
              <p className="text-sm text-muted-foreground">{data.donation.description}</p>
            ) : null}

            <Separator />

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Donor</dt>
              <dd>
                {data.donation.donor_name}
                <span className="block font-mono text-xs text-muted-foreground">
                  {data.donation.donor_phone ?? '—'}
                </span>
              </dd>
              <dt className="text-muted-foreground">Claimed by</dt>
              <dd>{data.donation.ngo_name ?? '—'}</dd>
              <dt className="text-muted-foreground">Pickup</dt>
              <dd>
                {data.donation.pickup_address ?? '—'}
                <span className="block font-mono text-xs text-muted-foreground">
                  {data.donation.pincode ?? '—'}
                </span>
              </dd>
              <dt className="text-muted-foreground">Item id</dt>
              <dd className="break-all font-mono text-xs">{data.donation.id}</dd>
            </dl>

            {data.donation.rejected_reason ? (
              <p className="hairline rounded-sm p-3 text-sm text-destructive">
                Rejected: {data.donation.rejected_reason}
              </p>
            ) : null}

            <Separator />

            {/* The checklist answers are stored precisely so a dispute about
                condition can be settled against what the donor claimed. */}
            <div>
              <h3 className="text-sm font-medium">What the donor confirmed</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(data.donation.condition_checklist ?? {}).map(([key, value]) => (
                  <li key={key} className="flex items-center gap-2">
                    <Badge variant={value ? 'success' : 'destructive'}>
                      {value ? 'yes' : 'no'}
                    </Badge>
                    <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <h2 className="mb-3 font-display text-display-sm">Timeline</h2>
              {data.events.length === 0 ? (
                <p className="text-muted-foreground">Nothing recorded.</p>
              ) : (
                <ol className="space-y-0">
                  {data.events.map((event, index) => (
                    <li key={event.id} className="relative flex gap-4 pb-5">
                      {index < data.events.length - 1 ? (
                        <span
                          className="absolute left-[7px] top-5 h-full w-px bg-border"
                          aria-hidden
                        />
                      ) : null}
                      <span className="relative mt-1.5 size-[15px] shrink-0 rounded-full border-2 border-primary bg-background" />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {event.event.replace(/_/g, ' ')}
                          {event.from_status && event.to_status ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {event.from_status} → {event.to_status}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(event.created_at), 'd MMM yyyy, HH:mm')}
                          {event.actor_name
                            ? ` · ${event.actor_name} (${event.actor_role})`
                            : ' · system'}
                        </p>
                        {event.request_id ? (
                          <p className="break-all font-mono text-xs text-muted-foreground">
                            req {event.request_id}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <details className="hairline rounded-sm bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Raw audit rows ({data.raw.length})
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Every mutation, before and after. Password hashes and live OTPs are stripped by the
                trigger and never reach this table.
              </p>
              <ul className="mt-3 space-y-3">
                {data.raw.map((row) => (
                  <li key={row.id} className="hairline rounded-sm p-3">
                    <p className="font-mono text-xs">
                      {format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss')} · {row.entity}.
                      {row.action} · {row.actor_name ?? 'system'}
                    </p>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>
      )}
    </AppShell>
  )
}
