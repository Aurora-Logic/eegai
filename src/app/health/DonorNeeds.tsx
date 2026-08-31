import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Droplet, HeartHandshake, Scissors, Settings2 } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { EmptyState } from '@/components/shared/empty-state'
import { Disclosure } from '@/components/health/disclosure'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { formatRelative } from '@/lib/dates'
import { healthApi, type NearbyRequest } from '@/lib/health-client'
import { CATEGORY_LABEL, URGENCY_LABEL, type HealthCategory } from '@/lib/validation/health'
import { useState } from 'react'

const ICON: Record<HealthCategory, typeof Droplet> = {
  blood: Droplet,
  hair: Scissors,
  breast_milk: HeartHandshake,
}

/**
 * Nearby requests — the donor's half of the health lane.
 *
 * Brief §2: an institution posts a need, nearby consenting donors are told,
 * the donor opts in and then goes there. Everything on this screen leads to
 * that one act, so there is exactly one button on each card.
 *
 * The contact number is not here. Brief §4 hands it over when somebody opts
 * in, and a scrollable list of direct lines into a blood bank would be a
 * different product from the one described.
 */
export default function DonorNeeds() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const me = useQuery({ queryKey: ['health', 'me'], queryFn: healthApi.me })
  const wall = useQuery({
    queryKey: ['health', 'nearby'],
    queryFn: healthApi.nearby,
    enabled: me.data?.consented === true,
  })

  const respond = useMutation({
    mutationFn: (id: string) => healthApi.respond(id),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['health'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  const actions = (
    <Button asChild variant="outline">
      <Link to="/health/settings">
        <Settings2 aria-hidden /> Preferences
      </Link>
    </Button>
  )

  if (me.isLoading) {
    return (
      <AppShell title="Nearby requests" actions={actions}>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    )
  }

  // Brief §5: consent is the gate, not a formality. Nothing is shown until it
  // has been given, and the way to give it is the only thing on the screen.
  if (!me.data?.consented) {
    return (
      <AppShell
        title="Nearby requests"
        subtitle="Hospitals, blood centres and milk banks near you."
        actions={actions}
      >
        <EmptyState
          title="Agree to the donor terms first"
          hint="We only alert you about requests near you, in the categories you choose. Your exact location is never shown to anybody."
          action={
            <Button asChild>
              <Link to="/health/settings">Read and agree</Link>
            </Button>
          }
        />
        <Disclosure className="mt-6" />
      </AppShell>
    )
  }

  const requests = wall.data?.requests ?? []

  return (
    <AppShell
      title="Nearby requests"
      subtitle="Hospitals, blood centres and milk banks near you."
      actions={actions}
    >
      {error ? (
        <p role="alert" className="hairline mb-4 rounded-sm bg-card p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {wall.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : requests.length === 0 ? (
        <EmptyState
          title="Nothing near you right now"
          hint="You will get an alert when a verified institution nearby needs what you have offered. Nothing to check back for."
          action={
            <Button asChild variant="outline">
              <Link to="/health/settings">Change what you offer</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3" aria-label="Nearby requests">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              busy={respond.isPending}
              onRespond={() => respond.mutate(request.id)}
            />
          ))}
        </ul>
      )}

      <Disclosure className="mt-6" />
    </AppShell>
  )
}

function RequestCard({
  request,
  busy,
  onRespond,
}: {
  request: NearbyRequest
  busy: boolean
  onRespond: () => void
}) {
  const Icon = ICON[request.category]
  const short = request.donors_needed - request.responses_count

  return (
    <li className="hairline rounded-sm bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary">
          <Icon aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{CATEGORY_LABEL[request.category]}</span>
            {request.blood_group ? <Badge variant="tag">{request.blood_group}</Badge> : null}
            {/* Urgency is the institution's own word for it, not a computed
                priority — this app makes no medical judgements (brief §6). */}
            <Badge variant={request.urgency === 'routine' ? 'muted' : 'destructive'}>
              {URGENCY_LABEL[request.urgency]}
            </Badge>
          </p>

          <p className="mt-1 text-sm">{request.institution}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {request.distance_km} km away
            {request.pincode ? ` · ${request.pincode}` : ''} · asked{' '}
            {formatRelative(request.created_at)}
          </p>

          {request.note ? <p className="mt-2 text-sm">{request.note}</p> : null}

          <p className="mt-2 text-sm text-muted-foreground">
            {short > 0
              ? `${short} more ${short === 1 ? 'donor' : 'donors'} needed`
              : 'Enough people have said yes'}
          </p>
        </div>
      </div>

      <div className="mt-3">
        {request.responded ? (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/health/responses">You said yes · see the details</Link>
          </Button>
        ) : (
          <Button className="w-full sm:w-auto" disabled={busy} onClick={onRespond}>
            I&apos;m willing to help
          </Button>
        )}
      </div>
    </li>
  )
}
