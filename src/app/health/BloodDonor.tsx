import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Droplet, MapPin } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { EmptyState } from '@/components/shared/empty-state'
import { FlowDiagram } from '@/components/shared/flow-diagram'
import { ConsentGate } from '@/components/health/consent-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useSession } from '@/hooks/use-session'
import { ApiError } from '@/lib/api'
import { AREA_BY_PINCODE } from '@/lib/coimbatore'
import { formatRelative } from '@/lib/dates'
import { HEALTH_FLOW } from '@/lib/flows'
import { healthApi, profileBody, type NearbyRequest } from '@/lib/health-client'
import {
  BLOOD_GROUPS,
  GENDERS,
  GENDER_LABEL,
  URGENCY_LABEL,
  type BloodGroup,
  type Gender,
} from '@/lib/validation/health'

/**
 * Blood, per the donor-module spec: register once, then answer alerts.
 *
 * The registration asks exactly the spec's fields. Name, phone and area are
 * already on the account, so they are shown rather than asked twice — a second
 * copy of somebody's phone number is a second one to go stale.
 */
export default function BloodDonor() {
  return (
    <AppShell
      title="Blood donation"
      subtitle="Register once. Hospitals alert you when they need blood."
    >
      <ConsentGate>
        <BloodBody />
      </ConsentGate>
    </AppShell>
  )
}

function BloodBody() {
  const me = useQuery({ queryKey: ['health', 'me'], queryFn: healthApi.me })
  const profile = me.data?.profile
  const registered = Boolean(profile?.categories.includes('blood') && profile.blood_group)

  if (me.isLoading) return <Skeleton className="h-72 w-full" />

  // Unregistered, the diagram leads at full width — it lays out by viewport, so
  // it cannot sit in a column. Registered, the alerts are what matter.
  return (
    <div className="space-y-6">
      {registered ? null : (
        <FlowDiagram title="How a blood alert works" steps={HEALTH_FLOW.donor} />
      )}
      <div
        className={
          registered
            ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start'
            : 'max-w-2xl'
        }
      >
        <div className="space-y-6 lg:order-2">
          <Registration registered={registered} />
        </div>
        {registered ? (
          <div className="space-y-6">
            <Alerts />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Registration({ registered }: { registered: boolean }) {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const me = useQuery({ queryKey: ['health', 'me'], queryFn: healthApi.me })
  const profile = me.data?.profile

  const [age, setAge] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('')
  const [lastDonation, setLastDonation] = useState('')
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!profile) return
    setAge(profile.age ? String(profile.age) : '')
    setGender(profile.gender ?? '')
    setBloodGroup(profile.blood_group ?? '')
    setLastDonation(profile.last_blood_donation ?? '')
    setAvailable(profile.available)
  }, [profile])

  const save = useMutation({
    mutationFn: () => {
      if (!bloodGroup) throw new Error('Choose your blood group — it is required.')
      const categories = profile?.categories ?? []
      return healthApi.savePreferences(
        profileBody(profile, {
          categories: categories.includes('blood') ? categories : [...categories, 'blood'],
          bloodGroup,
          age: age ? Number(age) : null,
          gender: gender || null,
          lastBloodDonation: lastDonation || null,
          available,
        }),
      )
    },
    onSuccess: async () => {
      setError(null)
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['health'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not save.'),
  })

  const leave = useMutation({
    mutationFn: () =>
      healthApi.savePreferences(
        profileBody(profile, {
          categories: (profile?.categories ?? []).filter((c) => c !== 'blood'),
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
  })

  const today = new Date().toISOString().slice(0, 10)
  const area = user?.profile.pincode ? AREA_BY_PINCODE.get(user.profile.pincode) : undefined
  const touch = () => setSaved(false)

  return (
    <section className="hairline space-y-4 rounded-sm bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-display-sm">Blood donor registration</h2>
        <Badge variant={registered ? 'success' : 'muted'}>
          {registered ? 'registered' : 'not registered'}
        </Badge>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Name</dt>
          <dd>{user?.fullName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Phone</dt>
          <dd className="font-mono">{user?.profile.phone ?? '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Location</dt>
          <dd className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
            {area
              ? `${area.name} · ${user?.profile.pincode}`
              : (user?.profile.pincode ?? 'Not set')}
            <Link to="/profile" className="ml-1 text-xs underline underline-offset-4">
              change
            </Link>
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="blood-type">Blood type (required)</Label>
          <Select
            value={bloodGroup}
            onValueChange={(v) => {
              touch()
              setBloodGroup(v as BloodGroup)
            }}
          >
            <SelectTrigger id="blood-type" aria-required>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {BLOOD_GROUPS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blood-age">Age</Label>
          <Input
            id="blood-age"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            value={age}
            onChange={(e) => {
              touch()
              setAge(e.target.value)
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blood-gender">Gender</Label>
          <Select
            value={gender}
            onValueChange={(v) => {
              touch()
              setGender(v as Gender)
            }}
          >
            <SelectTrigger id="blood-gender">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g} value={g}>
                  {GENDER_LABEL[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blood-last">Last blood donation</Label>
          <Input
            id="blood-last"
            type="date"
            max={today}
            value={lastDonation}
            onChange={(e) => {
              touch()
              setLastDonation(e.target.value)
            }}
          />
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="text-sm">
          Available to donate
          <span className="block text-xs text-muted-foreground">
            Off means no alerts until you turn it back on.
          </span>
        </span>
        <Switch
          checked={available}
          onCheckedChange={(v) => {
            touch()
            setAvailable(v)
          }}
        />
      </label>

      {/* The spec's note, in the place somebody reads it: we store these and
          show them to a hospital, and decide nothing from them. */}
      <p className="text-xs text-muted-foreground">
        The hospital decides whether you can donate, in person. EEGAI does not screen anybody.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : saved ? 'Saved' : registered ? 'Save changes' : 'Register'}
        </Button>
        {registered ? (
          <Button variant="outline" disabled={leave.isPending} onClick={() => leave.mutate()}>
            Stop being a blood donor
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function Alerts() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const wall = useQuery({ queryKey: ['health', 'nearby'], queryFn: healthApi.nearby })

  const answer = useMutation({
    mutationFn: (v: { id: string; available: boolean }) => healthApi.respond(v.id, v.available),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['health'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  const alerts = (wall.data?.requests ?? []).filter((r) => r.category === 'blood')

  return (
    <section className="space-y-3">
      <h2 className="font-display text-display-sm">Blood alerts</h2>
      {error ? (
        <p role="alert" className="hairline rounded-sm bg-card p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {wall.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : alerts.length === 0 ? (
        <EmptyState
          title="No blood alerts right now"
          hint="When a verified hospital posts one, every registered blood donor is told. Nothing to check back for."
        />
      ) : (
        <ul className="space-y-3" aria-label="Blood alerts">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              busy={answer.isPending}
              onAnswer={(available) => answer.mutate({ id: alert.id, available })}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function AlertCard({
  alert,
  busy,
  onAnswer,
}: {
  alert: NearbyRequest
  busy: boolean
  onAnswer: (available: boolean) => void
}) {
  return (
    <li className="hairline rounded-sm bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary">
          <Droplet aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant="tag" className="font-mono">
              {alert.blood_group}
            </Badge>
            <span className="font-medium">
              {alert.donors_needed} {alert.donors_needed === 1 ? 'unit' : 'units'} required
            </span>
            <Badge variant={alert.urgency === 'routine' ? 'muted' : 'destructive'}>
              {URGENCY_LABEL[alert.urgency]}
            </Badge>
          </p>
          <p className="mt-1 text-sm">{alert.institution}</p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {alert.address}
              {alert.distance_km !== null ? ` · ${alert.distance_km} km away` : ''}
            </span>
          </p>
          {alert.note ? <p className="mt-2 text-sm">{alert.note}</p> : null}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            posted {formatRelative(alert.created_at)}
          </p>
        </div>
      </div>

      {alert.my_answer === true ? (
        <p className="mt-3 text-sm">
          <Badge variant="success">You are available</Badge>{' '}
          <span className="text-muted-foreground">The hospital will contact you.</span>{' '}
          <Link to="/health/responses" className="underline underline-offset-4">
            Where to go
          </Link>
        </p>
      ) : alert.my_answer === false ? (
        <p className="mt-3 text-sm text-muted-foreground">
          <Badge variant="muted">Not available</Badge> Your number was not shared.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          disabled={busy || alert.my_answer === true}
          onClick={() => onAnswer(true)}
          className="sm:w-auto"
        >
          Available to donate
        </Button>
        <Button
          variant="outline"
          disabled={busy || alert.my_answer === false}
          onClick={() => onAnswer(false)}
          className="sm:w-auto"
        >
          Not available
        </Button>
      </div>
    </li>
  )
}
