import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatRelative } from '@/lib/dates'
import { Ban, RotateCcw } from 'lucide-react'
import { CreateAccountDialog } from './CreateAccountDialog'
import { Field, RecordCard, RecordList } from '@/components/admin/record-card'
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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api } from '@/lib/api'

interface Person {
  id: string
  full_name: string
  phone: string | null
  role: string
  pincode: string | null
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export function People() {
  const [role, setRole] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', role],
    queryFn: () => api.get<{ users: Person[] }>(`/admin/users?role=${role}`),
  })

  const users = data?.users ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Everyone with an account. Accounts are created here — there is no public sign-up.
        </p>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="donor">Donors</SelectItem>
            <SelectItem value="ngo">Organisations</SelectItem>
            <SelectItem value="volunteer">Volunteers</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
          </SelectContent>
        </Select>

        <CreateAccountDialog />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <RecordList columns={3}>
          {users.map((person) => (
            <RecordCard
              key={person.id}
              title={person.full_name}
              subtitle={person.phone ?? '—'}
              badges={
                <>
                  <Badge variant={person.role === 'admin' ? 'destructive' : 'tag'}>
                    {person.role}
                  </Badge>
                  {!person.is_active ? <Badge variant="destructive">disabled</Badge> : null}
                </>
              }
              actions={<ActiveToggle person={person} />}
            >
              <Field label="Area">{person.pincode ?? '—'}</Field>
              <Field label="Last seen">
                {person.last_login_at ? formatRelative(person.last_login_at) : 'never'}
              </Field>
            </RecordCard>
          ))}
        </RecordList>
      )}
    </section>
  )
}

/**
 * Disable or restore an account — the soft delete (PLAN.md §M7).
 *
 * There is no hard delete anywhere in this product. audit_log and
 * donation_events are the dispute record for every item, and donations carry
 * foreign keys to whoever handled them; removing a row would break those or
 * silently rewrite history. Disabling stops the sign-in, which is what "delete
 * this user" actually means in practice.
 *
 * Confirmed rather than one-tap, because it locks a real person out of an
 * account they may be mid-donation with, and the row it sits in is a list where
 * the wrong card is one thumb-width away.
 */
function ActiveToggle({ person }: { person: Person }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setActive = useMutation({
    mutationFn: (isActive: boolean) => api.post(`/admin/users/${person.id}/active`, { isActive }),
    onSuccess: async () => {
      setConfirming(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  if (person.is_active) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          <Ban aria-hidden /> Disable
        </Button>

        {confirming ? (
          <AlertDialog open onOpenChange={(open) => !open && setConfirming(false)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable {person.full_name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  They will not be able to sign in. Nothing they have posted or claimed is removed,
                  and the trail of every item stays intact. You can restore them at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  className="min-h-11"
                  disabled={setActive.isPending}
                  onClick={() => setActive.mutate(false)}
                >
                  {setActive.isPending ? 'Disabling…' : 'Disable'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </>
    )
  }

  // Restoring is not destructive, so it needs no confirmation — but a failure
  // still has to say so, or the button quietly stops mid-"Restoring…" and the
  // operator walks away believing the account is back.
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={setActive.isPending}
        onClick={() => setActive.mutate(true)}
      >
        <RotateCcw aria-hidden /> {setActive.isPending ? 'Restoring…' : 'Restore'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
