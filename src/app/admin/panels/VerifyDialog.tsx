import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api } from '@/lib/api'

export type VerifyAction = 'verified' | 'rejected' | 'suspended'

const COPY: Record<VerifyAction, { title: string; verb: string; needsReason: boolean }> = {
  verified: { title: 'Approve', verb: 'Approve', needsReason: false },
  rejected: { title: 'Reject', verb: 'Reject', needsReason: true },
  suspended: { title: 'Suspend', verb: 'Suspend', needsReason: true },
}

/**
 * One dialog for both NGO and volunteer decisions.
 *
 * A rejection or suspension requires a written reason — the server enforces a
 * minimum too. An unexplained refusal is unappealable, and the reason is what
 * ends up in the audit trail when someone disputes it later.
 */
export function VerifyDialog({
  open,
  onOpenChange,
  subject,
  endpoint,
  action,
  invalidateKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  endpoint: string
  action: VerifyAction
  invalidateKey: string[]
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const copy = COPY[action]

  const submit = useMutation({
    mutationFn: () => api.post(endpoint, { status: action, reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invalidateKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] })
      setReason('')
      setError(null)
      onOpenChange(false)
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'That did not go through. Try again.'),
  })

  const tooShort = copy.needsReason && reason.trim().length < 8

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {copy.title} {subject}?
          </DialogTitle>
          <DialogDescription>
            {copy.needsReason
              ? 'The reason is recorded in the audit trail and shown to them.'
              : 'They will be able to claim items straight away.'}
          </DialogDescription>
        </DialogHeader>

        {copy.needsReason ? (
          <div className="space-y-1.5">
            <Label htmlFor="verify-reason">Reason</Label>
            <Textarea
              id="verify-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Registration certificate does not match the DARPAN listing."
            />
            {tooShort && reason.length > 0 ? (
              <p className="text-sm text-muted-foreground">At least 8 characters.</p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={action === 'verified' ? 'default' : 'destructive'}
            disabled={tooShort || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Saving…' : copy.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
