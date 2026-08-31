import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, RecordCard, RecordList } from '@/components/admin/record-card'
import { ClearedQueueScene, NoMatchesScene } from '@/components/illustrations/admin'
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
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/dates'
import {
  CATEGORY_LABEL,
  URGENCY_LABEL,
  type HealthCategory,
  type Urgency,
} from '@/lib/validation/health'
import { STATUS_VARIANT } from './status'

interface Need {
  id: string
  institution_name: string
  category: HealthCategory
  blood_group: string | null
  urgency: Urgency
  donors_needed: number
  responses_count: number
  radius_km: number
  status: string
  note: string | null
  pincode: string | null
  created_at: string
  expires_at: string
  closed_at: string | null
  institution_status: string | null
}

/**
 * Moderating the health lane. Brief §4: "moderate requests".
 *
 * An admin cannot post a request and cannot see who answered one — that is the
 * institution's business, and brief §5 keeps donor identities out of anywhere
 * they are not needed. What an admin can do is take a request down, which is
 * the thing moderation actually means here.
 */
export function NeedsPanel() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'needs', status],
    queryFn: () => api.get<{ requests: Need[] }>(`/admin/health-requests?status=${status}`),
  })

  const close = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      api.post(`/admin/health-requests/${v.id}/close`, { status: v.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })

  const requests = data?.requests ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Only an approved institution can post one. Taking one down does not tell the people who
          already said yes — ring them.
        </p>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="fulfilled">Filled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : requests.length === 0 ? (
        status === 'open' ? (
          <EmptyState
            illustration={<ClearedQueueScene className="w-full" />}
            title="Nothing open"
            hint="No institution is asking for blood, hair or breast milk right now."
          />
        ) : (
          <EmptyState
            illustration={<NoMatchesScene className="w-full" />}
            title="No request is in that state"
            hint="Try another filter, or All to see every request on record."
          />
        )
      ) : (
        <RecordList columns={2}>
          {requests.map((need) => (
            <RecordCard
              key={need.id}
              title={`${CATEGORY_LABEL[need.category]}${need.blood_group ? ` · ${need.blood_group}` : ''}`}
              subtitle={need.institution_name}
              badges={
                <>
                  <Badge variant={need.urgency === 'routine' ? 'muted' : 'destructive'}>
                    {URGENCY_LABEL[need.urgency]}
                  </Badge>
                  <Badge variant={need.status === 'open' ? 'tag' : 'muted'}>{need.status}</Badge>
                  {/* A live request from an organisation that has since been
                      suspended is the one an admin most needs to spot. */}
                  {need.institution_status && need.institution_status !== 'verified' ? (
                    <Badge variant={STATUS_VARIANT[need.institution_status] ?? 'destructive'}>
                      institution {need.institution_status}
                    </Badge>
                  ) : null}
                </>
              }
              actions={
                need.status === 'open' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={close.isPending}
                    onClick={() => close.mutate({ id: need.id, status: 'cancelled' })}
                  >
                    Take it down
                  </Button>
                ) : null
              }
            >
              <Field label="Answered">
                {need.responses_count} of {need.donors_needed}
              </Field>
              <Field label="Reach">
                {need.radius_km} km · {need.pincode ?? '—'}
              </Field>
              <Field label="Asked">{formatRelative(need.created_at)}</Field>
              {need.note ? <Field label="Note">{need.note}</Field> : null}
            </RecordCard>
          ))}
        </RecordList>
      )}
    </section>
  )
}
