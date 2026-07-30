import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { canTransition } from '@/lib/state-machine'
import type { DonationStatus } from '@/lib/validation/donation'

/**
 * Take an item off the wall.
 *
 * Cancelled, not deleted. `audit_log` and `donation_events` are the dispute
 * record, donations are referenced by pickups, shipments and acknowledgements,
 * and §2 is explicit that history is not rewritable — a DELETE would either
 * break those references or quietly erase what happened. Cancelling stops the
 * item moving and takes it off every wall, which is what "remove" means
 * operationally.
 *
 * The button only appears where the state machine has the edge. An item already
 * collected cannot be cancelled: a volunteer is carrying it, and the software
 * saying otherwise would not change that. For those, the item finishes its
 * journey and the NGO rejects it if it must.
 */
export function RemoveItem({
  id,
  title,
  status,
}: {
  id: string
  title: string
  status: DonationStatus
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Asked of the machine rather than hardcoded, so this cannot drift from the
  // rules the database enforces.
  const removable = canTransition(status, 'cancelled', 'admin')

  const remove = useMutation({
    mutationFn: () =>
      api.post(`/donations/${id}/transition`, { to: 'cancelled', reason: reason.trim() }),
    onSuccess: async () => {
      setOpen(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  if (!removable) return null

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Remove
      </Button>

      {open ? (
        <AlertDialog open onOpenChange={(next) => !next && setOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Take “{title}” off the wall?</AlertDialogTitle>
              <AlertDialogDescription>
                It stops moving and disappears from every organisation&apos;s wall. Nothing is
                deleted — the donor still sees it, marked cancelled, and the trail stays intact.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="remove-reason">Why? (optional)</Label>
              <Textarea
                id="remove-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Donor asked for it to be taken down."
              />
              <p className="text-xs text-muted-foreground">
                Recorded in the trail. The donor sees this, so a sentence beats silence.
              </p>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">Keep it</AlertDialogCancel>
              <Button
                variant="destructive"
                className="min-h-11"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? 'Removing…' : 'Remove it'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}
