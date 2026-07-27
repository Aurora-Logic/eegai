import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { RoleScene } from '@/components/illustrations/roles'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'

type NewRole = 'ngo' | 'volunteer' | 'admin'

const ROLES: { value: NewRole; label: string; hint: string }[] = [
  { value: 'ngo', label: 'Organisation', hint: 'Can claim items straight away' },
  { value: 'volunteer', label: 'Volunteer', hint: 'Can collect and deliver' },
  { value: 'admin', label: 'Admin', hint: 'Full access, including this screen' },
]

interface Created {
  profileId: string
  role: string
  temporaryPassword: string
}

/**
 * Creating an account from the admin screen.
 *
 * For the organisation that walked in with its papers, the volunteer who
 * registered at a desk, and the second admin — none of whom can be created any
 * other way. Self-service signup deliberately refuses the admin role, so
 * without this the only way to make one was editing the seed.
 *
 * Accounts made here are verified immediately: an admin holding the documents
 * has already done the verifying, and a second approval screen would be
 * theatre.
 *
 * The password is generated server-side and shown exactly once. An admin
 * choosing passwords for other people produces either a pattern they reuse or a
 * note on a desk; four words are easier to read down a phone line than a random
 * string and stronger than what most people would have picked.
 */
export function CreateAccountDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    fullName: '',
    phone: '',
    pincode: '',
    role: 'ngo' as NewRole,
  })
  const [created, setCreated] = useState<Created | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const create = useMutation({
    mutationFn: () =>
      api.post<Created>('/admin/users', {
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim(),
        role: draft.role,
        ...(draft.pincode.trim() ? { pincode: draft.pincode.trim() } : {}),
      }),
    onSuccess: async (result) => {
      setCreated(result)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'That account could not be created.'),
  })

  function reset() {
    setOpen(false)
    setCreated(null)
    setError(null)
    setCopied(false)
    setDraft({ fullName: '', phone: '', pincode: '', role: 'ngo' })
  }

  const valid = draft.fullName.trim().length >= 2 && /^[6-9]\d{9}$/.test(draft.phone.trim())

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <UserPlus aria-hidden /> Add an account
        </Button>
      </DialogTrigger>

      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                Read this password out to them now. It is not stored anywhere it can be recovered
                from, so once this dialog closes it is gone.
              </DialogDescription>
            </DialogHeader>

            <div className="hairline rounded-sm bg-background p-4 text-center">
              <p className="font-mono text-xl tracking-wide">{created.temporaryPassword}</p>
            </div>

            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                void navigator.clipboard?.writeText(created.temporaryPassword)
                setCopied(true)
              }}
            >
              <Copy aria-hidden /> {copied ? 'Copied' : 'Copy password'}
            </Button>

            <p className="text-sm text-muted-foreground">
              They sign in with <span className="font-mono">{draft.phone}</span> and can change it
              afterwards.
            </p>

            <DialogFooter>
              <Button className="min-h-11" onClick={reset}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add an account</DialogTitle>
              <DialogDescription>
                For someone who registered in person. They are verified immediately.
              </DialogDescription>
            </DialogHeader>

            {/* The scene follows the radio. Same reasoning as the old sign-up
                form: this is the only choice here that changes what the account
                can do, and a radio group states it very quietly. */}
            <RoleScene role={draft.role} className="mx-auto w-full max-w-[240px] text-foreground" />

            <fieldset>
              <legend className="mb-2 text-sm font-medium">What kind of account?</legend>
              <RadioGroup
                value={draft.role}
                onValueChange={(role) => setDraft((d) => ({ ...d, role: role as NewRole }))}
                className="grid gap-2"
              >
                {ROLES.map((choice) => (
                  <label
                    key={choice.value}
                    htmlFor={`new-${choice.value}`}
                    className={cn(
                      'hairline flex min-h-11 cursor-pointer items-center gap-3 rounded-sm bg-card p-3',
                      draft.role === choice.value && 'outline outline-2 outline-primary',
                    )}
                  >
                    <RadioGroupItem value={choice.value} id={`new-${choice.value}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{choice.label}</span>
                      <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="new-name">
                {draft.role === 'ngo' ? 'Organisation name' : 'Full name'}
              </Label>
              <Input
                id="new-name"
                value={draft.fullName}
                onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-phone">Phone number</Label>
                <Input
                  id="new-phone"
                  inputMode="numeric"
                  placeholder="98XXXXXXXX"
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-pin">Pincode (optional)</Label>
                <Input
                  id="new-pin"
                  inputMode="numeric"
                  value={draft.pincode}
                  onChange={(e) => setDraft((d) => ({ ...d, pincode: e.target.value }))}
                />
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button variant="ghost" className="min-h-11" onClick={reset}>
                Cancel
              </Button>
              <Button
                className="min-h-11"
                disabled={!valid || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? 'Creating…' : 'Create account'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
