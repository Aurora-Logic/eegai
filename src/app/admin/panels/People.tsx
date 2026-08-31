import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatRelative } from '@/lib/dates'
import { Ban, KeyRound, PhoneCall, RotateCcw, Trash2, UserCog, UserRoundCog } from 'lucide-react'
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
      <DeletionQueue />
      <RoleQueue />
      <ResetQueue />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Everyone with an account. People can sign up themselves, and you can create accounts here.
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
              actions={
                <>
                  <ChangeRole person={person} />
                  <ResetPassword person={person} />
                  <ActiveToggle person={person} />
                </>
              }
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

const ROLES = ['donor', 'ngo', 'volunteer', 'admin'] as const

/**
 * Move somebody between roles.
 *
 * The server refuses while they still have work in hand, and says what — an
 * organisation mid-delivery demoted to donor strands the item where no screen
 * can reach it. That message is shown verbatim rather than replaced with a
 * generic failure, because it tells the operator what to finish first.
 *
 * Promoting to an organisation needs an address, which this dialog does not ask
 * for. It is deliberately a two-step: change the role, then use Edit on the
 * Organisations tab, where the whole record is in front of you.
 */
function ChangeRole({ person }: { person: Person }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<string>(person.role)
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () => api.post<{ message: string }>(`/admin/users/${person.id}/role`, { role }),
    onSuccess: async () => {
      setOpen(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCog aria-hidden /> Role
      </Button>

      {open ? (
        <AlertDialog open onOpenChange={(next) => !next && setOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change what {person.full_name} is</AlertDialogTitle>
              <AlertDialogDescription>
                They keep everything they have already done. An organisation promoted here still
                needs an address — set it on the Organisations tab afterwards.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="New role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
              <Button
                className="min-h-11"
                disabled={role === person.role || change.isPending}
                onClick={() => change.mutate()}
              >
                {change.isPending ? 'Changing…' : 'Change role'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

/**
 * The forgot-password path.
 *
 * There is no SMS gateway, so a self-service reset link has nowhere to send
 * anything — the same constraint that put handover codes in the app. An admin
 * resets it and reads the new one out. Shown once and never recoverable.
 */
function ResetPassword({ person }: { person: Person }) {
  const [open, setOpen] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useMutation({
    mutationFn: () => api.post<{ temporaryPassword: string }>(`/admin/users/${person.id}/password`),
    onSuccess: (result) => {
      setIssued(result.temporaryPassword)
      setError(null)
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  function close() {
    setOpen(false)
    setIssued(null)
    setError(null)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound aria-hidden /> Password
      </Button>

      {open ? (
        <AlertDialog open onOpenChange={(next) => !next && close()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {issued ? 'New password' : `Reset the password for ${person.full_name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {issued
                  ? 'Read it out to them now. It is stored only as a hash, so once this closes nobody can recover it.'
                  : 'Their current password stops working immediately. You will be given a new one to read out.'}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {issued ? (
              <div className="hairline rounded-sm bg-background p-4 text-center">
                <p className="font-mono text-xl tracking-wide">{issued}</p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <AlertDialogFooter>
              {issued ? (
                <Button className="min-h-11" onClick={close}>
                  Done
                </Button>
              ) : (
                <>
                  <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
                  <Button
                    className="min-h-11"
                    disabled={reset.isPending}
                    onClick={() => reset.mutate()}
                  >
                    {reset.isPending ? 'Resetting…' : 'Reset password'}
                  </Button>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

interface ResetRequest {
  id: string
  phone: string
  note: string | null
  created_at: string
  profile_id: string | null
  full_name: string | null
  role: string | null
}

/**
 * People waiting to be called back about a password.
 *
 * Sits above the list rather than in its own tab: it is a queue that should be
 * empty, and a queue nobody passes is a queue nobody clears. It disappears
 * entirely when there is nothing waiting.
 *
 * A request from an unregistered number is shown too. It usually means somebody
 * is trying the wrong number, which is worth knowing when they ring.
 */
function ResetQueue() {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin', 'password-requests'],
    queryFn: () => api.get<{ requests: ResetRequest[] }>('/admin/password-requests'),
  })

  const close = useMutation({
    mutationFn: (id: string) => api.post(`/admin/password-requests/${id}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })

  const requests = data?.requests ?? []
  if (requests.length === 0) return null

  return (
    <section className="hairline rounded-sm border-primary/40 bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-display-sm">
        <PhoneCall className="size-4 text-primary" aria-hidden />
        {requests.length === 1
          ? 'Someone is locked out'
          : `${requests.length} people are locked out`}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        There is no automatic reset, so these are waiting on a phone call. Find them below, reset
        the password, read it out, then clear the request.
      </p>

      <ul className="mt-3 space-y-2">
        {requests.map((request) => (
          <li
            key={request.id}
            className="hairline flex flex-wrap items-center justify-between gap-2 rounded-sm p-3 text-sm"
          >
            <span className="min-w-0">
              <span className="block font-medium">
                {request.full_name ?? 'No account with that number'}
              </span>
              <span className="block font-mono text-xs text-muted-foreground">
                {request.phone} · asked {formatRelative(request.created_at)}
              </span>
              {request.note ? (
                <span className="mt-1 block text-muted-foreground">“{request.note}”</span>
              ) : null}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={close.isPending}
              onClick={() => close.mutate(request.id)}
            >
              Done
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface RoleRequestRow {
  id: string
  profile_id: string
  full_name: string
  phone: string | null
  current_role: string
  requested_role: string
  reason: string | null
  created_at: string
}

/**
 * People who have asked to become something else.
 *
 * Sits above the list for the same reason the password queue does: it should be
 * empty, and a queue nobody walks past is a queue nobody clears. It disappears
 * when there is nothing waiting.
 *
 * There is no Approve button here on purpose. Granting the ask is the ordinary
 * role change on their card below, which is where the refusals live — an
 * organisation mid-delivery, an admin demoting itself — and doing it there
 * closes this request as part of the same transaction. A second path would be a
 * second set of guards to keep in step.
 */
function RoleQueue() {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin', 'role-requests'],
    queryFn: () => api.get<{ requests: RoleRequestRow[] }>('/admin/role-requests'),
  })

  const dismiss = useMutation({
    mutationFn: (id: string) => api.post(`/admin/role-requests/${id}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })

  const requests = data?.requests ?? []
  if (requests.length === 0) return null

  return (
    <section className="hairline rounded-sm border-primary/40 bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-display-sm">
        <UserRoundCog className="size-4 text-primary" aria-hidden />
        {requests.length === 1
          ? 'Someone wants to change what they are'
          : `${requests.length} people want to change what they are`}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use Role on their card below to grant it — that clears the request too. Dismiss only closes
        it, and changes nothing.
      </p>

      <ul className="mt-3 space-y-2">
        {requests.map((request) => (
          <li
            key={request.id}
            className="hairline flex flex-wrap items-center justify-between gap-2 rounded-sm p-3 text-sm"
          >
            <span className="min-w-0">
              <span className="block font-medium">{request.full_name}</span>
              <span className="block font-mono text-xs text-muted-foreground">
                {request.phone ?? '—'} · {request.current_role} → {request.requested_role} · asked{' '}
                {formatRelative(request.created_at)}
              </span>
              {request.reason ? (
                <span className="mt-1 block text-muted-foreground">“{request.reason}”</span>
              ) : null}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(request.id)}
            >
              Dismiss
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface DeletionRequest {
  id: string
  profile_id: string
  full_name: string
  phone: string | null
  role: string
  reason: string | null
  created_at: string
  is_active: boolean
}

/**
 * People who asked to be deleted.
 *
 * The app tells them somebody will call, so this queue is that promise. It sits
 * at the top of People with the other two for the same reason: a queue nobody
 * walks past is a queue nobody clears, and it disappears when it is empty.
 *
 * Marking one done does not delete anything. Donations already made are
 * referenced by audit rows that exist to settle disputes, so the honest action
 * is a phone call and a record that it happened.
 */
function DeletionQueue() {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin', 'deletion-requests'],
    queryFn: () => api.get<{ requests: DeletionRequest[] }>('/admin/deletion-requests'),
  })

  const handle = useMutation({
    mutationFn: (id: string) => api.post(`/admin/deletion-requests/${id}/handle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })

  const requests = data?.requests ?? []
  if (requests.length === 0) return null

  return (
    <section className="hairline rounded-sm border-destructive/40 bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-display-sm">
        <Trash2 className="size-4 text-destructive" aria-hidden />
        {requests.length === 1
          ? 'Someone asked to be deleted'
          : `${requests.length} people asked to be deleted`}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        They were told somebody would call. Ring them, agree what happens, then clear it — marking
        it done removes nothing on its own.
      </p>

      <ul className="mt-3 space-y-2">
        {requests.map((request) => (
          <li
            key={request.id}
            className="hairline flex flex-wrap items-center justify-between gap-2 rounded-sm p-3 text-sm"
          >
            <span className="min-w-0">
              <span className="block font-medium">
                {request.full_name}
                {!request.is_active ? (
                  <span className="ml-2 text-xs text-muted-foreground">already turned off</span>
                ) : null}
              </span>
              <span className="block font-mono text-xs text-muted-foreground">
                {request.phone ?? '—'} · {request.role} · asked {formatRelative(request.created_at)}
              </span>
              {request.reason ? (
                <span className="mt-1 block text-muted-foreground">“{request.reason}”</span>
              ) : null}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={handle.isPending}
              onClick={() => handle.mutate(request.id)}
            >
              Done
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
