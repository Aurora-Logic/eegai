import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, RecordCard, RecordList } from '@/components/admin/record-card'
import { ClearedQueueScene, NoMatchesScene } from '@/components/illustrations/admin'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api } from '@/lib/api'
import { formatRelative } from '@/lib/dates'

interface Report {
  id: string
  subject_type: string
  subject_id: string | null
  detail: string
  status: string
  resolution: string | null
  created_at: string
  handled_at: string | null
  reporter_name: string
  reporter_phone: string | null
  reporter_role: string
}

const SUBJECT_LABEL: Record<string, string> = {
  health_request: 'a donation request',
  ngo: 'an organisation',
  donation: 'an item',
  profile: 'a person',
}

/**
 * Complaints. Brief §4: "handle complaints".
 *
 * Closing one needs a sentence saying what was done, and the database refuses
 * it otherwise. A complaints process that can be cleared silently is not one —
 * the person who complained has to be able to see that somebody looked.
 */
export function ReportsPanel() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const [resolving, setResolving] = useState<{ report: Report; to: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: () => api.get<{ reports: Report[] }>(`/admin/reports?status=${status}`),
  })

  const reports = data?.reports ?? []
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] })

  const review = useMutation({
    mutationFn: (id: string) =>
      api.post(`/admin/reports/${id}/resolve`, { status: 'reviewing', resolution: '' }),
    onSuccess: refresh,
  })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Somebody was let down and is waiting to hear back. Closing one needs a note saying what
          was done about it.
        </p>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="reviewing">Being looked at</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : reports.length === 0 ? (
        status === 'open' ? (
          <EmptyState
            illustration={<ClearedQueueScene className="w-full" />}
            title="Nobody is waiting"
            hint="Every complaint has been answered. New ones land here."
          />
        ) : (
          <EmptyState
            illustration={<NoMatchesScene className="w-full" />}
            title="No complaint is in that state"
            hint="Try another filter, or All to see everything on record."
          />
        )
      ) : (
        <RecordList columns={2}>
          {reports.map((report) => (
            <RecordCard
              key={report.id}
              title={`About ${SUBJECT_LABEL[report.subject_type] ?? report.subject_type}`}
              subtitle={`${report.reporter_name} · ${report.reporter_role}`}
              badges={
                <Badge
                  variant={
                    report.status === 'open'
                      ? 'destructive'
                      : report.status === 'resolved'
                        ? 'success'
                        : 'muted'
                  }
                >
                  {report.status}
                </Badge>
              }
              actions={
                report.status === 'open' || report.status === 'reviewing' ? (
                  <>
                    {report.status === 'open' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={review.isPending}
                        onClick={() => review.mutate(report.id)}
                      >
                        I am looking at it
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => setResolving({ report, to: 'resolved' })}>
                      Resolve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResolving({ report, to: 'dismissed' })}
                    >
                      Dismiss
                    </Button>
                  </>
                ) : null
              }
            >
              <Field label="What happened">{report.detail}</Field>
              <Field label="Reach them">
                <span className="font-mono text-xs">{report.reporter_phone ?? '—'}</span>
              </Field>
              <Field label="Filed">{formatRelative(report.created_at)}</Field>
              {report.resolution ? <Field label="Outcome">{report.resolution}</Field> : null}
            </RecordCard>
          ))}
        </RecordList>
      )}

      {resolving ? (
        <ResolveDialog
          report={resolving.report}
          to={resolving.to}
          onClose={() => setResolving(null)}
          onDone={refresh}
        />
      ) : null}
    </section>
  )
}

function ResolveDialog({
  report,
  to,
  onClose,
  onDone,
}: {
  report: Report
  to: string
  onClose: () => void
  onDone: () => void
}) {
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => api.post(`/admin/reports/${report.id}/resolve`, { status: to, resolution }),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  return (
    <AlertDialog open onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {to === 'resolved' ? 'Resolve this complaint' : 'Dismiss this complaint'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {report.reporter_name} can see this. Say what was done, in a sentence.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Textarea
          rows={3}
          aria-label="What was done"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Rang the hospital, they have changed their reception hours and updated the listing."
        />

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
          <Button
            className="min-h-11"
            disabled={resolution.trim().length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : to === 'resolved' ? 'Resolve' : 'Dismiss'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
