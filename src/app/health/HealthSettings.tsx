import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/shared/app-shell'
import { REQUIRED_DISCLOSURE } from '@/components/health/disclosure'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import { healthApi } from '@/lib/health-client'
import { useSession } from '@/hooks/use-session'
import {
  BLOOD_GROUPS,
  CATEGORY_LABEL,
  HEALTH_CATEGORIES,
  type BloodGroup,
  type HealthCategory,
} from '@/lib/validation/health'
import { cn } from '@/lib/utils'

/**
 * Consent, preferences and the account controls, on one screen.
 *
 * Brief §4 asks for a consent screen reachable at any time from settings, and
 * §5 asks for withdrawal to be easy. They are the same screen because
 * separating them is how "easy withdrawal" quietly becomes three taps and a
 * support call.
 */
export default function HealthSettings() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { signOut } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['health', 'me'], queryFn: healthApi.me })

  const [categories, setCategories] = useState<HealthCategory[]>([])
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | 'none'>('none')
  const [notify, setNotify] = useState(true)
  const [shareLocation, setShareLocation] = useState(true)

  useEffect(() => {
    if (!data) return
    setCategories(data.profile?.categories ?? [])
    setBloodGroup(data.profile?.blood_group ?? 'none')
    setNotify(data.profile?.notify ?? true)
    setShareLocation(data.profile?.share_location ?? true)
  }, [data])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['health'] })

  const save = useMutation({
    mutationFn: () =>
      healthApi.savePreferences({
        categories,
        bloodGroup: bloodGroup === 'none' ? null : bloodGroup,
        notify,
        shareLocation,
      }),
    onSuccess: async () => {
      setSaved(true)
      setError(null)
      await refresh()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not save.'),
  })

  const consent = useMutation({
    mutationFn: healthApi.consent,
    onSuccess: async () => {
      setError(null)
      await refresh()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  const withdraw = useMutation({
    mutationFn: healthApi.withdrawConsent,
    onSuccess: refresh,
  })

  if (isLoading) {
    return (
      <AppShell title="Donation preferences">
        <Skeleton className="h-72 w-full" />
      </AppShell>
    )
  }

  const consented = data?.consented === true

  return (
    <AppShell
      title="Donation preferences"
      subtitle="What you are willing to be asked about, and how we reach you."
    >
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          {/* ---- consent ---- */}
          <section className="hairline space-y-3 rounded-sm bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-display-sm">Your consent</h2>
              <Badge variant={consented ? 'success' : 'muted'}>
                {consented ? 'given' : 'not given'}
              </Badge>
            </div>

            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                We use your area only to work out which requests are near you. Your exact location
                is never shown to an institution or to anybody else.
              </li>
              <li>Only organisations we have verified can post a request or send you an alert.</li>
              <li>
                An institution learns your name and phone number only when you choose to say yes to
                a request — never before.
              </li>
              <li>You can withdraw this at any time, from this screen.</li>
            </ul>

            <p className="text-xs text-muted-foreground">{REQUIRED_DISCLOSURE}</p>

            {consented ? (
              <Button
                variant="outline"
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate()}
              >
                {withdraw.isPending ? 'Withdrawing…' : 'Withdraw my consent'}
              </Button>
            ) : (
              <Button disabled={consent.isPending} onClick={() => consent.mutate()}>
                {consent.isPending ? 'Saving…' : 'I agree'}
              </Button>
            )}
          </section>

          {/* ---- preferences ---- */}
          <section className="hairline space-y-4 rounded-sm bg-card p-4">
            <h2 className="font-display text-display-sm">What you can offer</h2>

            <div className="flex flex-wrap gap-1.5">
              {HEALTH_CATEGORIES.map((category) => {
                const on = categories.includes(category)
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={on}
                    className="inline-flex min-h-11 items-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => {
                      setSaved(false)
                      setCategories(
                        on ? categories.filter((c) => c !== category) : [...categories, category],
                      )
                    }}
                  >
                    <Badge variant={on ? 'tag' : 'outline'} className={cn(!on && 'opacity-60')}>
                      {CATEGORY_LABEL[category]}
                    </Badge>
                  </button>
                )
              })}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blood-group">Your blood group (optional)</Label>
              <Select
                value={bloodGroup}
                onValueChange={(v) => {
                  setSaved(false)
                  setBloodGroup(v as BloodGroup | 'none')
                }}
              >
                <SelectTrigger id="blood-group" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Prefer not to say</SelectItem>
                  {BLOOD_GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Brief §6: no eligibility checks. Saying what this is for stops
                  it reading as a medical screening question. */}
              <p className="text-xs text-muted-foreground">
                Only used so we do not alert you about a group that is not yours. We never decide
                whether you can donate — the institution does that, in person.
              </p>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span className="text-sm">
                Alert me about nearby requests
                <span className="block text-xs text-muted-foreground">
                  Off means no messages. You can still look at this screen.
                </span>
              </span>
              <Switch
                checked={notify}
                onCheckedChange={(v) => {
                  setSaved(false)
                  setNotify(v)
                }}
              />
            </label>

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span className="text-sm">
                Use my area to find nearby requests
                <span className="block text-xs text-muted-foreground">
                  Off means we cannot match you, so you will see nothing.
                </span>
              </span>
              <Switch
                checked={shareLocation}
                onCheckedChange={(v) => {
                  setSaved(false)
                  setShareLocation(v)
                }}
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : saved ? 'Saved' : 'Save preferences'}
            </Button>
          </section>
        </div>

        <div className="space-y-6">
          {/* No standing Disclosure here: the consent card above already sets
              out the same words as part of what somebody is agreeing to, and
              printing it twice on one screen reads as a mistake. */}
          <AccountControls onSignedOut={() => void signOut().then(() => navigate('/'))} />
        </div>
      </div>
    </AppShell>
  )
}

/**
 * Brief §4: deactivate or delete the account.
 *
 * Two different promises, so two different controls. Deactivation is immediate
 * and reversible. Deletion is a request, because donations already made are
 * referenced by an audit trail that exists to settle disputes — a button
 * claiming to erase them would be a lie, and saying so is better than
 * appearing to.
 */
function AccountControls({ onSignedOut }: { onSignedOut: () => void }) {
  const [confirming, setConfirming] = useState<'deactivate' | 'delete' | null>(null)
  const [asked, setAsked] = useState(false)

  const deactivate = useMutation({
    mutationFn: healthApi.deactivate,
    onSuccess: onSignedOut,
  })

  const requestDeletion = useMutation({
    mutationFn: () => healthApi.requestDeletion(''),
    onSuccess: () => {
      setAsked(true)
      setConfirming(null)
    },
  })

  return (
    <section className="hairline space-y-3 rounded-sm bg-card p-4">
      <h2 className="font-display text-display-sm">Your account</h2>

      <p className="text-sm text-muted-foreground">
        Turning your account off stops you signing in and stops every alert. An administrator can
        turn it back on if you change your mind.
      </p>
      <Button variant="outline" onClick={() => setConfirming('deactivate')}>
        Turn my account off
      </Button>

      <p className="pt-2 text-sm text-muted-foreground">
        Deleting is a request rather than a button, because what you have already donated is
        recorded in a trail we keep to settle disputes. Somebody will call you.
      </p>
      <Button variant="outline" disabled={asked} onClick={() => setConfirming('delete')}>
        {asked ? 'We have your request' : 'Ask to delete my account'}
      </Button>

      {confirming ? (
        <AlertDialog open onOpenChange={(next) => !next && setConfirming(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirming === 'deactivate' ? 'Turn your account off?' : 'Ask us to delete it?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirming === 'deactivate'
                  ? 'You will be signed out and will not be able to sign back in. Nothing you have done is removed.'
                  : 'We will call you to confirm before anything is removed.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                className="min-h-11"
                disabled={deactivate.isPending || requestDeletion.isPending}
                onClick={() =>
                  confirming === 'deactivate' ? deactivate.mutate() : requestDeletion.mutate()
                }
              >
                {confirming === 'deactivate' ? 'Turn it off' : 'Send the request'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  )
}
