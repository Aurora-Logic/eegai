import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { VerifyDialog, type VerifyAction } from './VerifyDialog'
import { STATUS_VARIANT } from './status'

interface Volunteer {
  id: string
  full_name: string
  phone: string | null
  pincode: string | null
  verification_status: string
  service_radius_km: number
  available_slots: Record<string, string[]>
  id_doc_path: string | null
  selfie_path: string | null
  pickups: number
  created_at: string
}

export function VolunteerQueue() {
  const [status, setStatus] = useState('pending')
  const [verifying, setVerifying] = useState<{ v: Volunteer; action: VerifyAction } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'volunteers', status],
    queryFn: () => api.get<{ volunteers: Volunteer[] }>(`/admin/volunteers?status=${status}`),
  })

  const volunteers = data?.volunteers ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A volunteer collects from people's homes. Verify before approving.
        </p>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Awaiting review</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : volunteers.length === 0 ? (
        <p className="hairline rounded-sm bg-card p-8 text-center text-muted-foreground">
          Nothing waiting here.
        </p>
      ) : (
        <div className="hairline overflow-x-auto rounded-sm bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Volunteer</TableHead>
                <TableHead>Identity</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {volunteers.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <span className="block font-medium">{v.full_name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {v.phone ?? '—'} · {v.pincode ?? '—'} · {v.pickups} pickups
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {/* Never rendered as an image here. The paths are admin-only
                        at the database level and an ID card does not belong on a
                        screen someone might be sharing. */}
                    <span className="block">ID: {v.id_doc_path ? 'uploaded' : 'missing'}</span>
                    <span className="block text-muted-foreground">
                      Selfie: {v.selfie_path ? 'uploaded' : 'missing'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="block">{v.service_radius_km} km radius</span>
                    <span className="block text-muted-foreground">
                      {Object.entries(v.available_slots ?? {})
                        .map(([day, slots]) => `${day} ${slots.join('/')}`)
                        .join(', ') || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[v.verification_status] ?? 'muted'}>
                      {v.verification_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex justify-end gap-2">
                      {v.verification_status !== 'verified' ? (
                        <Button size="sm" onClick={() => setVerifying({ v, action: 'verified' })}>
                          <ShieldCheck aria-hidden /> Approve
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setVerifying({ v, action: 'suspended' })}
                        >
                          Suspend
                        </Button>
                      )}
                      {v.verification_status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setVerifying({ v, action: 'rejected' })}
                        >
                          Reject
                        </Button>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {verifying ? (
        <VerifyDialog
          open
          onOpenChange={(next) => !next && setVerifying(null)}
          subject={verifying.v.full_name}
          endpoint={`/admin/volunteers/${verifying.v.id}/verify`}
          action={verifying.action}
          invalidateKey={['admin', 'volunteers']}
        />
      ) : null}
    </section>
  )
}
