import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Check, Download, Heart } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { PhotoGallery } from '@/components/shared/photo-gallery'
import { ArrivedScene } from '@/components/illustrations/journey'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, photoUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { DonationStatus } from '@/lib/validation/donation'

interface Event {
  id: string
  created_at: string
  event: string
  to_status: string | null
}

interface Acknowledgement {
  photo_path: string | null
  note: string | null
  created_at: string
  ngo_name: string
}

interface Pickup {
  slot_date: string | null
  slot: string | null
  collected_at: string | null
  delivered_at: string | null
  volunteer_name: string | null
}

interface Donation {
  id: string
  title: string
  description: string | null
  category: string
  quantity: number
  status: DonationStatus
  pincode: string | null
  posted_at: string
  rejected_reason: string | null
  ngo_name: string | null
  photos: { path: string }[]
}

/**
 * The six stages a donor is told about, in order.
 *
 * This is a fixed rail rather than a render of whatever events happened, because
 * the two answer different questions. A list of events says what has happened; a
 * rail also says what is still coming, which is the thing someone checking on
 * their belongings actually wants to know. The admin trail keeps the raw list —
 * that view is for disputes, this one is for reassurance.
 */
const STAGES: { status: DonationStatus; label: string; hint: string }[] = [
  { status: 'posted', label: 'On the wall', hint: 'Organisations nearby can see it.' },
  { status: 'claimed', label: 'Claimed', hint: 'An organisation asked for it.' },
  { status: 'scheduled', label: 'Collection arranged', hint: 'A time has been agreed.' },
  { status: 'in_transit', label: 'On its way', hint: 'It has left your address.' },
  { status: 'received', label: 'Arrived', hint: 'The organisation has it.' },
  { status: 'acknowledged', label: 'Confirmed', hint: 'They checked it and said thank you.' },
]

export default function DonationTimeline() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['donations', 'timeline', id],
    queryFn: () =>
      api.get<{
        donation: Donation
        events: Event[]
        acknowledgement: Acknowledgement | null
        pickup: Pickup | null
      }>(`/donations/${id}/timeline`),
    enabled: Boolean(id),
  })

  const donation = data?.donation
  const events = data?.events ?? []

  // When each stage was reached. A stage with no timestamp has not happened.
  const reachedAt = new Map<string, string>()
  for (const event of events) {
    const key = event.to_status ?? event.event
    if (!reachedAt.has(key)) reachedAt.set(key, event.created_at)
  }
  if (donation && !reachedAt.has('posted')) reachedAt.set('posted', donation.posted_at)

  const currentIndex = donation ? STAGES.findIndex((s) => s.status === donation.status) : -1
  const ended = donation?.status === 'rejected' || donation?.status === 'cancelled'

  return (
    <AppShell
      title="Where it got to"
      subtitle={donation?.title}
      actions={
        <Button asChild variant="outline">
          <Link to="/donor">
            <ArrowLeft aria-hidden /> Your items
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !donation ? (
        <p role="alert" className="text-destructive">
          That item does not exist, or it is not yours.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* The acknowledgement leads on a phone. It is the payoff, and burying
              it under a status rail on a 360px screen wastes it. */}
          <div className="space-y-6 md:order-2">
            {data?.acknowledgement ? (
              <section className="hairline overflow-hidden rounded-sm bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Heart className="size-4 text-primary" aria-hidden />
                  <h2 className="font-display text-display-sm">It arrived</h2>
                </div>

                {data.acknowledgement.photo_path ? (
                  <img
                    src={photoUrl(data.acknowledgement.photo_path)}
                    alt={`Sent by ${data.acknowledgement.ngo_name}`}
                    className="block w-full"
                  />
                ) : (
                  <ArrivedScene className="w-full text-foreground" />
                )}

                <div className="space-y-2 p-4">
                  {data.acknowledgement.note ? (
                    <p className="text-pretty">"{data.acknowledgement.note}"</p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    — {data.acknowledgement.ngo_name},{' '}
                    {format(new Date(data.acknowledgement.created_at), 'd MMM yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This photo was sent to you alone. Nobody else can open it.
                  </p>
                </div>
              </section>
            ) : null}

            {donation.status === 'acknowledged' ? (
              <Button asChild variant="outline" className="min-h-11 w-full">
                {/* A plain anchor, not fetch — the browser's own download
                    handling is what puts the file somewhere a person can find
                    it again on Android. */}
                <a href={`/api/donations/${donation.id}/receipt.pdf`} download>
                  <Download aria-hidden /> Download the record (PDF)
                </a>
              </Button>
            ) : null}

            {donation.status === 'rejected' && donation.rejected_reason ? (
              <section className="hairline rounded-sm border-destructive/40 bg-card p-4">
                <h2 className="font-display text-display-sm text-destructive">It was sent back</h2>
                <p className="mt-2 text-pretty">{donation.rejected_reason}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Nothing about this counts against you. Fix what is described above and post it
                  again.
                </p>
              </section>
            ) : null}

            <section className="hairline space-y-3 rounded-sm bg-card p-4">
              {/* Every photo they posted, not just the cover — this is the one
                  place a donor goes back to look at what they gave away. */}
              <PhotoGallery photos={donation.photos ?? []} alt={donation.title} />
              <h2 className="font-display text-display-sm leading-tight">{donation.title}</h2>
              <p className="flex flex-wrap gap-1">
                <Badge>{donation.category}</Badge>
                <Badge variant="muted">×{donation.quantity}</Badge>
              </p>
              {donation.ngo_name ? (
                <p className="text-sm text-muted-foreground">Claimed by {donation.ngo_name}</p>
              ) : null}
            </section>
          </div>

          <section className="md:order-1">
            <h2 className="mb-4 font-display text-display-sm">The journey</h2>

            <ol>
              {STAGES.map((stage, index) => {
                const at = reachedAt.get(stage.status)
                const done = at !== undefined || (currentIndex >= 0 && index < currentIndex)
                const current = index === currentIndex
                const last = index === STAGES.length - 1

                return (
                  <li key={stage.status} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last ? (
                      <span
                        className={cn(
                          'absolute left-[11px] top-6 h-full w-0.5',
                          done ? 'bg-primary' : 'bg-border',
                        )}
                        aria-hidden
                      />
                    ) : null}

                    <span
                      className={cn(
                        'relative grid size-6 shrink-0 place-items-center rounded-full border-2',
                        done
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background',
                        current && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background',
                      )}
                    >
                      {done ? <Check className="size-3.5" aria-hidden /> : null}
                    </span>

                    <div className="min-w-0 pt-0.5">
                      <p className={cn('font-medium', !done && 'text-muted-foreground')}>
                        {stage.label}
                        {current && !ended ? (
                          <span className="ml-2 align-middle text-xs font-normal text-primary">
                            now
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted-foreground">{stage.hint}</p>
                      {at ? (
                        <p className="font-mono text-xs text-muted-foreground">
                          {format(new Date(at), 'd MMM yyyy, HH:mm')}
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>

            {data?.pickup?.volunteer_name ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Collected by {data.pickup.volunteer_name}.
              </p>
            ) : null}

            {ended ? (
              <p className="mt-4 text-sm text-muted-foreground">
                This item is {donation.status} and will not move again.
              </p>
            ) : null}
          </section>
        </div>
      )}
    </AppShell>
  )
}
