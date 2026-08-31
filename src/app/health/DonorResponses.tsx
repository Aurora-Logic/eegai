import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Phone } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { EmptyState } from '@/components/shared/empty-state'
import { ReportDialog } from '@/components/shared/report-dialog'
import { Disclosure } from '@/components/health/disclosure'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/dates'
import { healthApi } from '@/lib/health-client'
import { CATEGORY_LABEL } from '@/lib/validation/health'

/**
 * What a donor said yes to, and where to go.
 *
 * This is the screen the whole lane exists to reach. Brief §2 ends with "donor
 * goes directly to the institution", so the address and the phone number are
 * the largest things here and the phone number is a tel: link — somebody
 * standing outside a hospital gate should be one tap from the desk.
 */
export default function DonorResponses() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['health', 'responses'],
    queryFn: healthApi.myResponses,
  })

  const withdraw = useMutation({
    mutationFn: (requestId: string) => healthApi.unrespond(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
  })

  if (isLoading) {
    return (
      <AppShell title="Where to go">
        <Skeleton className="h-40 w-full" />
      </AppShell>
    )
  }

  const responses = data?.responses ?? []
  const live = responses.filter((r) => !r.withdrawn_at)

  return (
    <AppShell title="Where to go" subtitle="Everything you have offered to help with.">
      {live.length === 0 ? (
        <EmptyState
          title="You have not offered yet"
          hint="When you say yes to a request, the address and the phone number appear here."
        />
      ) : (
        <ul className="space-y-3" aria-label="Your offers">
          {live.map((r) => (
            <li key={r.response_id} className="hairline rounded-sm bg-card p-4">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.institution}</span>
                <Badge variant="tag">{CATEGORY_LABEL[r.category]}</Badge>
                {r.blood_group ? <Badge>{r.blood_group}</Badge> : null}
                {r.status !== 'open' ? <Badge variant="muted">{r.status}</Badge> : null}
              </p>

              <p className="mt-2 flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{r.address}</span>
              </p>

              {r.contact_phone ? (
                <p className="mt-1.5 flex items-center gap-2 text-sm">
                  <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a href={`tel:${r.contact_phone}`} className="underline underline-offset-4">
                    {r.contact_phone}
                  </a>
                  {r.contact_person ? (
                    <span className="text-muted-foreground">· ask for {r.contact_person}</span>
                  ) : null}
                </p>
              ) : null}

              {r.visit_instructions ? (
                <p className="mt-2 text-sm text-muted-foreground">{r.visit_instructions}</p>
              ) : null}

              <p className="mt-2 font-mono text-xs text-muted-foreground">
                you said yes {formatRelative(r.responded_at)}
              </p>

              {/* Changing your mind is better than not turning up, so it is a
                  plain button rather than something to hunt for. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status === 'open' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate(r.request_id)}
                  >
                    I can no longer make it
                  </Button>
                ) : null}
                {/* The moment a complaint is most likely: somebody travelled to
                    a hospital and it did not go as agreed. */}
                <ReportDialog
                  subjectType="health_request"
                  subjectId={r.request_id}
                  about={r.institution}
                  label="Something went wrong"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Disclosure className="mt-6" />
    </AppShell>
  )
}
