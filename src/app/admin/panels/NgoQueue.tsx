import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileText, Pencil, ShieldCheck } from 'lucide-react'
import { Field, RecordCard, RecordList } from '@/components/admin/record-card'
import { ClearedQueueScene, NoMatchesScene } from '@/components/illustrations/admin'
import { EmptyState } from '@/components/shared/empty-state'
import { EditNgoDialog, type EditableNgo } from './EditNgoDialog'
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
import { api, photoUrl } from '@/lib/api'
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
  is_accepting: boolean
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
  const [editing, setEditing] = useState<EditableNgo | null>(null)

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
        // An empty review queue and an empty filter mean opposite things. The
        // first is the queue being clear, which is the goal; the second is a
        // question that found nothing, and the records are still there.
        status === 'pending' ? (
          <EmptyState
            illustration={<ClearedQueueScene className="w-full" />}
            title="The queue is clear"
            hint="Every organisation that applied has been reviewed. New applications land here."
          />
        ) : (
          <EmptyState
            illustration={<NoMatchesScene className="w-full" />}
            title="No organisation is in that state"
            hint="Try another filter, or All to see every organisation on record."
          />
        )
      ) : (
        <RecordList>
          {ngos.map((ngo) => (
            <RecordCard
              key={ngo.id}
              title={ngo.name}
              subtitle={`${ngo.address ?? '—'} · ${ngo.pincode ?? '—'}`}
              badges={
                <>
                  <Badge variant={STATUS_VARIANT[ngo.verification_status] ?? 'muted'}>
                    {ngo.verification_status}
                  </Badge>
                  {ngo.has_80g ? <Badge variant="outline">80G</Badge> : null}
                </>
              }
              actions={
                <>
                  <Button variant="outline" size="sm" onClick={() => setViewingDocs(ngo)}>
                    <FileText aria-hidden /> Papers ({ngo.document_count})
                    {ngo.unreviewed_count > 0 ? ` · ${ngo.unreviewed_count} unread` : ''}
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => setEditing(ngo)}>
                    <Pencil aria-hidden /> Edit
                  </Button>

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
                </>
              }
            >
              <Field label="Contact">
                <span className="font-mono text-xs">{ngo.contact_phone ?? '—'}</span>
              </Field>
              <Field label="Registration">
                <span className="block font-mono text-xs">{ngo.registration_number ?? '—'}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  DARPAN {ngo.darpan_id ?? '—'}
                </span>
              </Field>
              <Field label="Accepts">
                <span className="flex flex-wrap gap-1">
                  {ngo.accepts_categories.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </span>
              </Field>
              <Field label="Capacity">
                {ngo.monthly_capacity}/month · {ngo.claims} claims
              </Field>
            </RecordCard>
          ))}
        </RecordList>
      )}

      {editing ? <EditNgoDialog ngo={editing} onClose={() => setEditing(null)} /> : null}

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
                <li
                  key={doc.id}
                  className="hairline flex flex-wrap items-center gap-3 rounded-sm p-3"
                >
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

                  {/* A paper you cannot read is not evidence. Opens in a new tab
                      rather than downloading, because an admin is checking a
                      registration number against a form on the same screen, not
                      collecting files. The route is authenticated and admin-only
                      at the database level. */}
                  <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
                    <a
                      href={photoUrl(doc.storage_path)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${doc.doc_type.replace(/_/g, ' ')} in a new tab`}
                    >
                      <ExternalLink aria-hidden /> Open
                    </a>
                  </Button>
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
