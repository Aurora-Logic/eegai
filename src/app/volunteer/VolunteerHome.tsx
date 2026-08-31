import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDayMonth, istDateStamp } from '@/lib/dates'
import { CheckCircle2, MapPin, PackageCheck } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { GuideCard } from '@/components/shared/guide-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WallEmpty } from '@/components/wall/wall'
import { ApiError, api, photoUrl } from '@/lib/api'
import { t } from '@/lib/i18n'

interface Pickup {
  id: string
  donation_id: string
  slot_date: string | null
  slot: string | null
  collected_at: string | null
  delivered_at: string | null
  title: string
  category: string
  quantity: number
  pickup_address: string | null
  pincode: string | null
  status: string
  donor_name: string
  donor_phone?: string | null
  ngo_name: string | null
  ngo_address?: string | null
  ngo_phone?: string | null
  photos?: { path: string }[]
}

/** Next seven days in IST, so a slot can never be chosen in the past. */
function nextDays(count = 7) {
  const today = new Date()
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today)
    day.setDate(today.getDate() + i)
    return { value: istDateStamp(day), label: formatDayMonth(day) }
  })
}

export default function VolunteerHome() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('open')
  const [accepting, setAccepting] = useState<Pickup | null>(null)
  const [verifying, setVerifying] = useState<{
    pickup: Pickup
    gate: 'collect' | 'deliver'
  } | null>(null)

  const open = useQuery({
    queryKey: ['pickups', 'open'],
    queryFn: () => api.get<{ pickups: Pickup[] }>('/pickups/open'),
  })
  const mine = useQuery({
    queryKey: ['pickups', 'mine'],
    queryFn: () => api.get<{ pickups: Pickup[] }>('/pickups/mine'),
  })

  const list = tab === 'open' ? open : mine
  const pickups = list.data?.pickups ?? []

  return (
    <AppShell title={t('volunteer.title')} subtitle={t('volunteer.subtitle')}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="open">Near you ({open.data?.pickups.length ?? 0})</TabsTrigger>
          <TabsTrigger value="mine">Your runs ({mine.data?.pickups.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {list.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : list.isError ? (
            <div className="hairline rounded-sm bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('error.generic')}</p>
              <Button variant="ghost" className="mt-3" onClick={() => void list.refetch()}>
                {t('action.retry')}
              </Button>
            </div>
          ) : pickups.length === 0 ? (
            <WallEmpty
              message={
                tab === 'open'
                  ? 'Nothing to collect near you right now.'
                  : "You haven't taken a pickup yet."
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {pickups.map((pickup) => (
                <li key={pickup.id} className="hairline rounded-sm bg-card p-4">
                  <div className="flex gap-3">
                    {pickup.photos?.[0] ? (
                      <img
                        src={photoUrl(pickup.photos[0].path)}
                        alt=""
                        className="hairline size-16 shrink-0 rounded-sm object-cover"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <h3 className="font-display text-display-sm leading-tight">{pickup.title}</h3>
                      <p className="flex flex-wrap gap-1 pt-1">
                        <Badge>{pickup.category}</Badge>
                        {pickup.quantity > 1 ? (
                          <Badge variant="muted">×{pickup.quantity}</Badge>
                        ) : null}
                        <Badge variant="outline">{pickup.status.replace('_', ' ')}</Badge>
                      </p>
                    </div>
                  </div>

                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">
                        <MapPin className="size-4" aria-hidden />
                        <span className="sr-only">Collect from</span>
                      </dt>
                      <dd>
                        {pickup.pickup_address ?? '—'}, {pickup.pincode ?? '—'}
                        <span className="block text-muted-foreground">
                          {pickup.donor_name}
                          {pickup.donor_phone ? ` · ${pickup.donor_phone}` : ''}
                        </span>
                      </dd>
                    </div>
                    {pickup.ngo_name ? (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">
                          <PackageCheck className="size-4" aria-hidden />
                          <span className="sr-only">Deliver to</span>
                        </dt>
                        <dd>
                          {pickup.ngo_name}
                          {pickup.ngo_address ? (
                            <span className="block text-muted-foreground">
                              {pickup.ngo_address}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                    {pickup.slot_date ? (
                      <p className="pt-1 font-mono text-xs text-muted-foreground">
                        {formatDayMonth(pickup.slot_date)} · {pickup.slot}
                      </p>
                    ) : null}
                  </dl>

                  <div className="mt-4">
                    {tab === 'open' ? (
                      <Button className="w-full" onClick={() => setAccepting(pickup)}>
                        I'll collect this
                      </Button>
                    ) : !pickup.collected_at ? (
                      <Button
                        className="w-full"
                        onClick={() => setVerifying({ pickup, gate: 'collect' })}
                      >
                        Collected — enter the donor's code
                      </Button>
                    ) : !pickup.delivered_at ? (
                      <Button
                        className="w-full"
                        onClick={() => setVerifying({ pickup, gate: 'deliver' })}
                      >
                        Delivered — enter the NGO's code
                      </Button>
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-success">
                        <CheckCircle2 className="size-4" aria-hidden /> Handed over
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {accepting ? (
        <AcceptDialog
          pickup={accepting}
          onClose={() => setAccepting(null)}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['pickups'] })
            setAccepting(null)
            setTab('mine')
          }}
        />
      ) : null}

      {verifying ? (
        <OtpDialog
          pickup={verifying.pickup}
          gate={verifying.gate}
          onClose={() => setVerifying(null)}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['pickups'] })
            setVerifying(null)
          }}
        />
      ) : null}
      <GuideCard className="mt-6" />
    </AppShell>
  )
}

function AcceptDialog({
  pickup,
  onClose,
  onDone,
}: {
  pickup: Pickup
  onClose: () => void
  onDone: () => void
}) {
  const days = nextDays()
  const [slotDate, setSlotDate] = useState(days[0]!.value)
  const [slot, setSlot] = useState('morning')
  const [error, setError] = useState<string | null>(null)

  const accept = useMutation({
    mutationFn: () => api.post(`/pickups/${pickup.donation_id}/accept`, { slotDate, slot }),
    onSuccess: onDone,
    onError: (e) =>
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Another volunteer took this one.'
          : e instanceof ApiError
            ? e.message
            : 'That did not go through.',
      ),
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collect {pickup.title}?</DialogTitle>
          <DialogDescription>
            The donor and the organisation each get a code. You will need both.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="slot-date">Day</Label>
            <Select value={slotDate} onValueChange={setSlotDate}>
              <SelectTrigger id="slot-date">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((day) => (
                  <SelectItem key={day.value} value={day.value}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-time">Time</Label>
            <Select value={slot} onValueChange={setSlot}>
              <SelectTrigger id="slot-time">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" disabled={accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? 'Taking…' : 'Take it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OtpDialog({
  pickup,
  gate,
  onClose,
  onDone,
}: {
  pickup: Pickup
  gate: 'collect' | 'deliver'
  onClose: () => void
  onDone: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const verify = useMutation({
    mutationFn: () => api.post(`/pickups/${pickup.donation_id}/verify`, { gate, code }),
    onSuccess: onDone,
    onError: (e) => {
      setCode('')
      setError(e instanceof ApiError ? e.message : 'That did not go through.')
    },
  })

  const who = gate === 'collect' ? pickup.donor_name : (pickup.ngo_name ?? 'the organisation')

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask {who} for their code</DialogTitle>
          <DialogDescription>
            They have a 4-digit code on their phone. Type what they read out — the code never
            reaches this app any other way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="otp">Code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="0000"
            className="text-center font-mono text-2xl tracking-[0.5em]"
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Six wrong tries and the code is cancelled and reissued.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="min-h-11"
            disabled={code.length !== 4 || verify.isPending}
            onClick={() => verify.mutate()}
          >
            {verify.isPending ? 'Checking…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
