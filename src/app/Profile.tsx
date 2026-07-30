import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Save } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ApiError, api } from '@/lib/api'
import { AREA_BY_PINCODE, areaOptions } from '@/lib/coimbatore'
import { formatDate } from '@/lib/dates'
import { t, type StringKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CATEGORIES } from '@/lib/validation/donation'

interface ProfileData {
  profile: {
    id: string
    full_name: string
    phone: string | null
    role: string
    pincode: string | null
    created_at: string
  }
  ngo: {
    name: string
    address: string | null
    pincode: string | null
    contact_person: string | null
    contact_phone: string | null
    monthly_capacity: number
    is_accepting: boolean
    has_80g: boolean
    verification_status: string
    accepts_categories: string[]
    claimed_this_month: number
  } | null
  volunteer: {
    service_radius_km: number
    verification_status: string
    pickups: number
  } | null
}

/**
 * Your own record, whichever role you are.
 *
 * ROADMAP has listed "profile edit screen" as missing since M1, and
 * profileUpdateSchema has existed that whole time with no route and no screen
 * behind it. Everything here writes through RLS self-update policies that were
 * written in M0 and never once called.
 *
 * Two things are deliberately not editable. Phone is the login identity and the
 * number a volunteer rings from a doorstep — changing it silently would lock
 * someone out and send a volunteer to a dead line, so an admin does it and the
 * trail records who. Verification status is not self-serve for the obvious
 * reason.
 */
export default function Profile() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<ProfileData>('/profile'),
  })

  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setDraft({
      fullName: data.ngo?.name ?? data.profile.full_name,
      pincode: data.ngo?.pincode ?? data.profile.pincode ?? '',
      address: data.ngo?.address ?? '',
      contactPerson: data.ngo?.contact_person ?? '',
      contactPhone: data.ngo?.contact_phone ?? '',
      isAccepting: data.ngo?.is_accepting ?? true,
      acceptsCategories: data.ngo?.accepts_categories ?? [],
      serviceRadiusKm: data.volunteer?.service_radius_km ?? 8,
    })
  }, [data])

  const save = useMutation({
    mutationFn: () => api.patch('/profile', draft),
    onSuccess: async () => {
      setSaved(true)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      await queryClient.invalidateQueries({ queryKey: ['session'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not save.'),
  })

  if (isLoading || !data || !draft) {
    return (
      <AppShell title="Your details">
        <Skeleton className="h-96 w-full" />
      </AppShell>
    )
  }

  const role = data.profile.role
  const set = (patch: Record<string, unknown>) => {
    setDraft({ ...draft, ...patch })
    setSaved(false)
  }

  return (
    <AppShell title="Your details" subtitle="What other people see, and how you are reached.">
      <div className="max-w-2xl space-y-6">
        <section className="hairline space-y-4 rounded-sm bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">{role === 'ngo' ? 'Organisation name' : 'Your name'}</Label>
            <Input
              id="p-name"
              value={String(draft.fullName ?? '')}
              onChange={(e) => set({ fullName: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('post.area')}</Label>
            <Combobox
              options={areaOptions()}
              value={String(draft.pincode ?? '')}
              onChange={(next) => {
                const area = AREA_BY_PINCODE.get(next)
                set({ pincode: next, lat: area?.lat, lng: area?.lng })
              }}
              placeholder={t('post.areaPlaceholder')}
              searchPlaceholder={t('post.areaSearch')}
              emptyText={t('post.areaEmpty')}
            />
          </div>

          {/* Read-only, and said plainly rather than left as a disabled box
              somebody will keep tapping. */}
          <div className="space-y-1.5">
            <Label>{t('auth.phone')}</Label>
            <p className="font-mono text-sm">{data.profile.phone ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              This is how you sign in and how a volunteer reaches you. An administrator changes it,
              so there is a record of who did.
            </p>
          </div>
        </section>

        {data.ngo ? (
          <section className="hairline space-y-4 rounded-sm bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-display-sm">Your organisation</h2>
              <Badge variant={data.ngo.verification_status === 'verified' ? 'success' : 'muted'}>
                {data.ngo.verification_status}
              </Badge>
              {data.ngo.has_80g ? <Badge variant="outline">80G</Badge> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-address">Where things are delivered</Label>
              <Input
                id="p-address"
                value={String(draft.address ?? '')}
                onChange={(e) => set({ address: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                A volunteer is given this address. Keep it one somebody can find.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-person">Contact person</Label>
                <Input
                  id="p-person"
                  value={String(draft.contactPerson ?? '')}
                  onChange={(e) => set({ contactPerson: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-cphone">Contact number</Label>
                <Input
                  id="p-cphone"
                  inputMode="tel"
                  value={String(draft.contactPhone ?? '')}
                  onChange={(e) => set({ contactPhone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">What you accept</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((category) => {
                  const on = (draft.acceptsCategories as string[]).includes(category)
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const current = draft.acceptsCategories as string[]
                        const next = on
                          ? current.filter((c) => c !== category)
                          : [...current, category]
                        // Accepting nothing would empty your wall with no
                        // explanation; the pause switch is what that is for.
                        if (next.length > 0) set({ acceptsCategories: next })
                      }}
                      className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Badge variant={on ? 'tag' : 'outline'} className={cn(!on && 'opacity-60')}>
                        {t(`category.${category}` as StringKey)}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm">
                Currently accepting
                <span className="block text-xs text-muted-foreground">
                  Off hides the wall from you without touching your verification.
                </span>
              </span>
              <Switch
                checked={Boolean(draft.isAccepting)}
                onCheckedChange={(isAccepting) => set({ isAccepting })}
              />
            </label>

            <Separator />
            <p className="text-sm text-muted-foreground">
              You have claimed{' '}
              <strong className="text-foreground">
                {data.ngo.claimed_this_month} of {data.ngo.monthly_capacity}
              </strong>{' '}
              items this month. An administrator sets the limit — ask them to change it.
            </p>
          </section>
        ) : null}

        {data.volunteer ? (
          <section className="hairline space-y-4 rounded-sm bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-display-sm">Your collections</h2>
              <Badge
                variant={data.volunteer.verification_status === 'verified' ? 'success' : 'muted'}
              >
                {data.volunteer.verification_status}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-radius">How far you will travel</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="p-radius"
                  type="number"
                  min={1}
                  max={50}
                  className="w-24"
                  value={Number(draft.serviceRadiusKm ?? 8)}
                  onChange={(e) => set({ serviceRadiusKm: Number(e.target.value) || 1 })}
                />
                <span className="text-sm text-muted-foreground">km from your area</span>
              </div>
              <p className="text-xs text-muted-foreground">
                You only see collections inside this. Set it short and the list will look empty when
                it is not.
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              {data.volunteer.pickups} collection{data.volunteer.pickups === 1 ? '' : 's'} so far.
            </p>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()}>
            <Save aria-hidden /> {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Saved.
            </p>
          ) : null}
        </div>

        <ChangePassword />

        <p className="text-xs text-muted-foreground">
          With us since {formatDate(data.profile.created_at)}.
        </p>
      </div>
    </AppShell>
  )
}

/**
 * The change-password endpoint has existed since M1 with nothing calling it.
 * Kept on this page rather than its own: it is a detail of your own record, and
 * a separate screen for one form is a navigation step for no reason.
 */
function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setDone(true)
      setError(null)
      setCurrent('')
      setNext('')
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  return (
    <section className="hairline space-y-4 rounded-sm bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-display-sm">
        <KeyRound className="size-4 text-primary" aria-hidden /> Change your password
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pw-current">Current password</Label>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-next">New password</Label>
          <Input
            id="pw-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-muted-foreground">
          Changed. Use the new one next time you sign in.
        </p>
      ) : null}

      <Button
        variant="outline"
        className="min-h-11"
        disabled={current.length < 1 || next.length < 8 || change.isPending}
        onClick={() => change.mutate()}
      >
        {change.isPending ? 'Changing…' : 'Change password'}
      </Button>
    </section>
  )
}
