import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface Ngo {
  id: string
  name: string
  registration_number: string | null
  darpan_id: string | null
  has_80g: boolean
  address: string | null
  pincode: string | null
  verification_status: string
  monthly_capacity: number
  accepts_categories: string[]
  contact_person: string | null
  contact_phone: string | null
  document_count: number
  unreviewed_count: number
  claims: number
  created_at: string
}

interface Doc {
  id: string
  doc_type: string
  storage_path: string
  reviewed: boolean
}

export function NgoQueue() {
  const [status, setStatus] = useState('pending')
  const [verifying, setVerifying] = useState<{ ngo: Ngo; action: VerifyAction } | null>(null)
  const [viewingDocs, setViewingDocs] = useState<Ngo | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ngos', status],
    queryFn: () => api.get<{ ngos: Ngo[] }>(`/admin/ngos?status=${status}`),
  })

  const docs = useQuery({
    queryKey: ['admin', 'ngo-docs', viewingDocs?.id],
    queryFn: () => api.get<{ documents: Doc[] }>(`/admin/ngos/${viewingDocs!.id}/documents`),
    enabled: !!viewingDocs,
  })

  const ngos = data?.ngos ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          An organisation cannot claim anything until it is verified.
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
      ) : ngos.length === 0 ? (
        <p className="hairline rounded-sm bg-card p-8 text-center text-muted-foreground">
          Nothing waiting here.
        </p>
      ) : (
        <div className="hairline overflow-x-auto rounded-sm bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead className="hidden md:table-cell">Registration</TableHead>
                <TableHead className="hidden md:table-cell">Categories</TableHead>
                <TableHead className="hidden md:table-cell">Papers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ngos.map((ngo) => (
                <TableRow key={ngo.id}>
                  <TableCell>
                    <span className="block font-medium">{ngo.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {ngo.address ?? '—'} · {ngo.pincode ?? '—'}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {ngo.contact_phone ?? '—'} · {ngo.claims} claims
                    </span>

                    {/* Three columns are hidden below md so the decision buttons
                        are reachable without a horizontal scroll. Nothing is
                        lost — the facts that mattered fold in here instead. */}
                    <span className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                      {ngo.accepts_categories.map((c) => (
                        <Badge key={c}>{c}</Badge>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => setViewingDocs(ngo)}
                      >
                        <FileText aria-hidden /> {ngo.document_count}
                      </Button>
                    </span>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    <span className="block">{ngo.registration_number ?? '—'}</span>
                    <span className="block text-muted-foreground">
                      DARPAN {ngo.darpan_id ?? '—'}
                    </span>
                    {ngo.has_80g ? (
                      <Badge variant="outline" className="mt-1">
                        80G
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="flex flex-wrap gap-1">
                      {ngo.accepts_categories.map((c) => (
                        <Badge key={c}>{c}</Badge>
                      ))}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      cap {ngo.monthly_capacity}/mo
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Button variant="outline" size="sm" onClick={() => setViewingDocs(ngo)}>
                      <FileText aria-hidden /> {ngo.document_count}
                    </Button>
                    {ngo.unreviewed_count > 0 ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {ngo.unreviewed_count} unread
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[ngo.verification_status] ?? 'muted'}>
                      {ngo.verification_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex justify-end gap-2">
                      {ngo.verification_status !== 'verified' ? (
                        <Button size="sm" onClick={() => setVerifying({ ngo, action: 'verified' })}>
                          <ShieldCheck aria-hidden /> Approve
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setVerifying({ ngo, action: 'suspended' })}
                        >
                          Suspend
                        </Button>
                      )}
                      {ngo.verification_status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setVerifying({ ngo, action: 'rejected' })}
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
          subject={verifying.ngo.name}
          endpoint={`/admin/ngos/${verifying.ngo.id}/verify`}
          action={verifying.action}
          invalidateKey={['admin', 'ngos']}
        />
      ) : null}

      <Dialog open={!!viewingDocs} onOpenChange={(next) => !next && setViewingDocs(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewingDocs?.name}</DialogTitle>
            <DialogDescription>
              Verification papers. These are admin-only at the database level — no NGO can read
              another's.
            </DialogDescription>
          </DialogHeader>

          {docs.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (docs.data?.documents.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">Nothing uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {docs.data?.documents.map((doc) => (
                <li key={doc.id} className="hairline flex items-center gap-3 rounded-sm p-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {doc.doc_type.replace(/_/g, ' ')}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {doc.storage_path}
                    </span>
                  </span>
                  <Badge variant={doc.reviewed ? 'success' : 'muted'}>
                    {doc.reviewed ? 'reviewed' : 'new'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {/* The seeded paths point at placeholder files; a real upload flow for
              NGO documents is still an open item. */}
          <p className="text-xs text-muted-foreground">
            Document upload for organisations is not built yet — these are seeded placeholders.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  )
}
