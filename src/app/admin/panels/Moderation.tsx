import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, photoUrl } from '@/lib/api'
import { DONATION_STATUSES } from '@/lib/validation/donation'
import { STATUS_VARIANT } from './status'

interface Row {
  id: string
  title: string
  category: string
  condition: string
  quantity: number
  status: string
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
        <p className="hairline rounded-sm bg-card p-8 text-center text-muted-foreground">
          Nothing matches that.
        </p>
      ) : (
        <div className="hairline overflow-x-auto rounded-sm bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Photo</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Donor</TableHead>
                <TableHead>Claimed by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Trail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.photos[0] ? (
                      <img
                        src={photoUrl(row.photos[0].path)}
                        alt=""
                        className="hairline size-12 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="block size-12 rounded-sm bg-muted" />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="block font-medium">{row.title}</span>
                    <span className="flex flex-wrap gap-1 pt-1">
                      <Badge>{row.category}</Badge>
                      <Badge>{row.condition.replace('_', ' ')}</Badge>
                      {row.quantity > 1 ? <Badge variant="muted">×{row.quantity}</Badge> : null}
                    </span>
                    {row.rejected_reason ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {row.rejected_reason}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="block">{row.donor_name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {row.donor_phone ?? '—'} · {row.pincode ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{row.ngo_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'muted'}>
                      {row.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/admin/items/${row.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
