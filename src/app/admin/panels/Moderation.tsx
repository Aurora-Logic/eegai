import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import type { DonationStatus } from '@/lib/validation/donation'
import { AddItemDialog } from './AddItemDialog'
import { RemoveItem } from './RemoveItem'
import { Field, RecordCard, RecordList } from '@/components/admin/record-card'
import { ClearedQueueScene, NoMatchesScene } from '@/components/illustrations/admin'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api, photoUrl } from '@/lib/api'
import { DONATION_STATUSES } from '@/lib/validation/donation'
import { STATUS_VARIANT } from './status'

interface Row {
  id: string
  title: string
  category: string
  condition: string
  quantity: number
  status: DonationStatus
  pincode: string | null
  posted_at: string
  donor_name: string
  donor_phone: string | null
  ngo_name: string | null
  rejected_reason: string | null
  photos: { path: string; sortOrder: number }[]
}

export function Moderation() {
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  // Debounce-free: the list is capped at 200 and the query is indexed, so a
  // keystroke-per-request is fine at pilot scale and simpler than a debounce.
  const [committed, setCommitted] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'donations', status, committed],
    queryFn: () =>
      api.get<{ donations: Row[] }>(
        `/admin/donations?status=${status}&q=${encodeURIComponent(committed)}`,
      ),
  })

  const rows = data?.donations ?? []

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <AddItemDialog />
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setCommitted(query)
        }}
      >
        <div className="min-w-48 flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by item or donor"
            aria-label="Search items"
          />
        </div>
        <Button type="submit" variant="outline">
          <Search aria-hidden /> Search
        </Button>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {DONATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        // With no filter and no search there is nothing to look elsewhere for —
        // the wall is genuinely empty, and the useful thing is the way to fix
        // that rather than an apology.
        status === 'all' && committed === '' ? (
          <EmptyState
            illustration={<ClearedQueueScene className="w-full" />}
            title="Nothing has been posted yet"
            hint="Every item a donor puts on the wall shows up here, at every stage of its journey."
            action={<AddItemDialog />}
          />
        ) : (
          <EmptyState
            illustration={<NoMatchesScene className="w-full" />}
            title="Nothing matches that"
            hint="Items are still there — this search just did not find them. Try a shorter word, or clear the filter."
          />
        )
      ) : (
        <RecordList columns={3}>
          {rows.map((row) => (
            <RecordCard
              key={row.id}
              title={
                <span className="flex items-center gap-2">
                  {row.photos[0] ? (
                    <img
                      src={photoUrl(row.photos[0].path)}
                      alt=""
                      className="hairline size-10 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <span className="block size-10 shrink-0 rounded-sm bg-muted" />
                  )}
                  {row.title}
                </span>
              }
              badges={
                <Badge variant={STATUS_VARIANT[row.status] ?? 'muted'}>
                  {row.status.replace('_', ' ')}
                </Badge>
              }
              actions={
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/admin/items/${row.id}`}>Open</Link>
                  </Button>
                  <RemoveItem id={row.id} title={row.title} status={row.status} />
                </>
              }
            >
              <Field label="What">
                <span className="flex flex-wrap gap-1">
                  <Badge>{row.category}</Badge>
                  <Badge>{row.condition.replace('_', ' ')}</Badge>
                  {row.quantity > 1 ? <Badge variant="muted">×{row.quantity}</Badge> : null}
                </span>
              </Field>
              <Field label="Donor">
                <span className="block">{row.donor_name}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {row.donor_phone ?? '—'} · {row.pincode ?? '—'}
                </span>
              </Field>
              <Field label="Claimed by">{row.ngo_name ?? '—'}</Field>
              {row.rejected_reason ? (
                <Field label="Rejected">
                  <span className="text-destructive">{row.rejected_reason}</span>
                </Field>
              ) : null}
            </RecordCard>
          ))}
        </RecordList>
      )}
    </section>
  )
}
