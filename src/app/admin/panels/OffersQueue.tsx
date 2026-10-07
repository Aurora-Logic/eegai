import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, RecordCard, RecordList } from '@/components/admin/record-card'
import { ClearedQueueScene, NoMatchesScene } from '@/components/illustrations/admin'
import { OFFER_VARIANT } from '@/lib/offer-status'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api, photoUrl } from '@/lib/api'
import { formatRelative } from '@/lib/dates'
import { CATEGORY_LABEL, OFFER_STATUS_LABEL, type OfferStatus } from '@/lib/validation/health'

interface AdminOffer {
  id: string
  category: 'hair' | 'breast_milk'
  status: OfferStatus
  details: Record<string, unknown>
  photo_path: string | null
  org_note: string | null
  created_at: string
  decided_at: string | null
  organisation: string
  organisation_phone: string | null
  donor_name: string
  donor_phone: string | null
}

/**
 * Hair and breast-milk offers across every partner.
 *
 * The admin's job here is chasing, not deciding: an offer that has sat for
 * days means a partner that is not answering. Declining is left to the
 * partner, who has the reason to give; an admin can only close an offer the
 * partner has confirmed on the phone.
 */
export function OffersQueue() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'offers', status],
    queryFn: () => api.get<{ offers: AdminOffer[] }>(`/admin/health-offers?status=${status}`),
  })

  const move = useMutation({
    mutationFn: (v: { id: string; status: OfferStatus }) =>
      api.post(`/admin/health-offers/${v.id}/decide`, { status: v.status }),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  const offers = data?.offers ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-display-sm">Hair and breast milk offers</h2>
          <p className="text-sm text-muted-foreground">
            Sent by donors to a partner they chose. Ring the partner before moving one for them.
          </p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Filter offers by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Waiting</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="completed">Received</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : offers.length === 0 ? (
        status === 'open' ? (
          <EmptyState
            illustration={<ClearedQueueScene className="w-full" />}
            title="No offer is waiting"
            hint="Every hair and milk offer has an answer from its partner."
          />
        ) : (
          <EmptyState
            illustration={<NoMatchesScene className="w-full" />}
            title="No offer is in that state"
            hint="Try another filter, or All."
          />
        )
      ) : (
        <RecordList columns={2}>
          {offers.map((o) => (
            <RecordCard
              key={o.id}
              title={`${CATEGORY_LABEL[o.category]} · ${o.donor_name}`}
              subtitle={`to ${o.organisation}`}
              badges={
                <Badge variant={OFFER_VARIANT[o.status]}>
                  {OFFER_STATUS_LABEL[o.category][o.status]}
                </Badge>
              }
              actions={
                o.status === 'submitted' || o.status === 'in_review' ? (
                  <Button
                    size="sm"
                    disabled={move.isPending}
                    onClick={() => move.mutate({ id: o.id, status: 'accepted' })}
                  >
                    Mark accepted
                  </Button>
                ) : o.status === 'accepted' ? (
                  <Button
                    size="sm"
                    disabled={move.isPending}
                    onClick={() => move.mutate({ id: o.id, status: 'completed' })}
                  >
                    Mark received
                  </Button>
                ) : null
              }
            >
              <Field label="Donor">
                <span className="font-mono text-xs">{o.donor_phone ?? '—'}</span>
              </Field>
              <Field label="Partner">
                <span className="font-mono text-xs">{o.organisation_phone ?? '—'}</span>
              </Field>
              <Field label="Sent">{formatRelative(o.created_at)}</Field>
              {o.category === 'hair' ? (
                <Field label="Hair">
                  {String(o.details['lengthInches'])} in
                  {o.photo_path ? (
                    <>
                      {' · '}
                      <a
                        href={photoUrl(o.photo_path)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        photo
                      </a>
                    </>
                  ) : null}
                </Field>
              ) : null}
              {o.org_note ? <Field label="Partner note">{o.org_note}</Field> : null}
            </RecordCard>
          ))}
        </RecordList>
      )}
    </section>
  )
}
