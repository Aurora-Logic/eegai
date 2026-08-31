import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Users } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { EmptyState } from '@/components/shared/empty-state'
import { Disclosure } from '@/components/health/disclosure'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { formatRelative } from '@/lib/dates'
import { healthApi, type OwnRequest } from '@/lib/health-client'
import {
  BLOOD_GROUPS,
  CATEGORY_LABEL,
  HEALTH_CATEGORIES,
  URGENCIES,
  URGENCY_LABEL,
  type BloodGroup,
  type HealthCategory,
  type Urgency,
} from '@/lib/validation/health'

/**
 * The institution's half: post a need, watch it fill, see who is coming.
 *
 * Nothing here schedules, collects or transports anything. Brief §6 puts all of
 * that with the institution, so the app's job ends at "these people said they
 * would come, here are their numbers".
 */
export default function InstitutionNeeds() {
  const [posting, setPosting] = useState(false)
  const [viewing, setViewing] = useState<OwnRequest | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['health', 'mine'],
    queryFn: healthApi.myRequests,
  })

  const requests = data?.requests ?? []
  const open = requests.filter((r) => r.status === 'open')
  const past = requests.filter((r) => r.status !== 'open')

  const standing = data?.standing ?? null
  // Brief §5: only verified institutions can post, and only in categories an
  // admin approved. Saying which of those is missing beats a button that fails.
  const blocker = !standing
    ? null
    : standing.verification_status !== 'verified'
      ? {
          title: 'Your organisation is not verified yet',
          body: 'An administrator is checking your papers. You will be able to post as soon as that is done — nothing is needed from you.',
        }
      : standing.health_categories.length === 0
        ? {
            title: 'Not approved for health donations',
            body: 'Blood, hair and breast milk requests are granted per organisation by an administrator. Ring us if you are a hospital, blood centre or milk bank and this looks wrong.',
          }
        : !standing.has_location
          ? {
              title: 'Your address has no location on it',
              body: 'We work out who is nearby from your location, so a request cannot go out without one. An administrator can set it.',
            }
          : null

  return (
    <AppShell
      title="Donation requests"
      subtitle="Ask the donors near you. They come to you."
      actions={
        blocker ? null : (
          <Button onClick={() => setPosting(true)}>
            <Megaphone aria-hidden /> Post a request
          </Button>
        )
      }
    >
      {blocker ? (
        <div className="hairline mb-6 rounded-sm border-primary/40 bg-card p-4">
          <p className="font-display text-display-sm">{blocker.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{blocker.body}</p>
        </div>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : requests.length === 0 ? (
        // Nothing when blocked: the panel above already says why there is
        // nothing here, and an invitation to post underneath it contradicts it.
        blocker ? null : (
          <EmptyState
            title="You have not asked for anything yet"
            hint="Post a request and every consenting donor nearby who offers that category is told. You will see how many."
            action={<Button onClick={() => setPosting(true)}>Post a request</Button>}
          />
        )
      ) : (
        <div className="space-y-6">
          <Section title="Open" requests={open} onView={setViewing} />
          {past.length > 0 ? <Section title="Closed" requests={past} onView={setViewing} /> : null}
        </div>
      )}

      <Disclosure className="mt-6" />

      {posting ? <PostDialog onClose={() => setPosting(false)} /> : null}
      {viewing ? <RespondersDialog request={viewing} onClose={() => setViewing(null)} /> : null}
    </AppShell>
  )
}

function Section({
  title,
  requests,
  onView,
}: {
  title: string
  requests: OwnRequest[]
  onView: (r: OwnRequest) => void
}) {
  const queryClient = useQueryClient()
  const close = useMutation({
    mutationFn: (v: { id: string; status: string }) => healthApi.close(v.id, v.status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
  })

  if (requests.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 font-display text-display-sm">{title}</h2>
      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="hairline rounded-sm bg-card p-4">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{CATEGORY_LABEL[r.category]}</span>
              {r.blood_group ? <Badge variant="tag">{r.blood_group}</Badge> : null}
              <Badge variant={r.urgency === 'routine' ? 'muted' : 'destructive'}>
                {URGENCY_LABEL[r.urgency]}
              </Badge>
              {r.status !== 'open' ? <Badge variant="muted">{r.status}</Badge> : null}
            </p>

            <p className="mt-1 text-sm">
              <strong>{r.responses_count}</strong> of {r.donors_needed} said yes · within{' '}
              {r.radius_km} km
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              asked {formatRelative(r.created_at)}
              {r.status === 'open' ? ` · closes ${formatRelative(r.expires_at)}` : ''}
            </p>
            {r.note ? <p className="mt-2 text-sm text-muted-foreground">{r.note}</p> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onView(r)}>
                <Users aria-hidden /> Who said yes ({r.responses_count})
              </Button>
              {r.status === 'open' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={close.isPending}
                    onClick={() => close.mutate({ id: r.id, status: 'fulfilled' })}
                  >
                    We have enough
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={close.isPending}
                    onClick={() => close.mutate({ id: r.id, status: 'cancelled' })}
                  >
                    Cancel
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PostDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<HealthCategory>('blood')
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | 'any'>('any')
  const [urgency, setUrgency] = useState<Urgency>('routine')
  const [donorsNeeded, setDonorsNeeded] = useState('1')
  const [radiusKm, setRadiusKm] = useState('10')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notified, setNotified] = useState<number | null>(null)

  const post = useMutation({
    mutationFn: () =>
      healthApi.postRequest({
        category,
        bloodGroup: category === 'blood' && bloodGroup !== 'any' ? bloodGroup : null,
        urgency,
        donorsNeeded,
        radiusKm,
        note: note.trim() || undefined,
      }),
    onSuccess: async (result) => {
      setNotified(result.notified)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['health'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{notified === null ? 'Post a request' : 'Request posted'}</DialogTitle>
          <DialogDescription>
            {notified === null
              ? 'Everyone nearby who offers this and has alerts on will be told. They come to you.'
              : // The count, and nothing else. Brief §5: the institution never
                // learns who is nearby.
                `${notified} ${notified === 1 ? 'donor was' : 'donors were'} alerted.`}
          </DialogDescription>
        </DialogHeader>

        {notified !== null ? (
          <Button className="min-h-11" onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="need-category">What you need</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as HealthCategory)}>
                <SelectTrigger id="need-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEALTH_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {category === 'blood' ? (
              <div className="space-y-1.5">
                <Label htmlFor="need-group">Blood group</Label>
                <Select value={bloodGroup} onValueChange={(v) => setBloodGroup(v as BloodGroup)}>
                  <SelectTrigger id="need-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any group</SelectItem>
                    {BLOOD_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="need-count">How many donors</Label>
                <Input
                  id="need-count"
                  type="number"
                  min={1}
                  max={500}
                  value={donorsNeeded}
                  onChange={(e) => setDonorsNeeded(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="need-radius">Within (km)</Label>
                <Input
                  id="need-radius"
                  type="number"
                  min={1}
                  max={50}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="need-urgency">Urgency</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
                <SelectTrigger id="need-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {URGENCIES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {URGENCY_LABEL[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="need-note">Anything a donor should know (optional)</Label>
              <Textarea
                id="need-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Two units short for a scheduled surgery tomorrow."
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button
              className="min-h-11 w-full"
              disabled={post.isPending}
              onClick={() => post.mutate()}
            >
              {post.isPending ? 'Posting…' : 'Post it'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Who said yes.
 *
 * A name and a phone number. There is no address and no map, because the app
 * has none to give — brief §5 keeps a donor's location out of an institution's
 * hands, and the schema is built so this screen could not show one even if
 * somebody added the markup.
 */
function RespondersDialog({ request, onClose }: { request: OwnRequest; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['health', 'responders', request.id],
    queryFn: () => healthApi.responders(request.id),
  })

  const responders = data?.responders ?? []

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who said yes</DialogTitle>
          <DialogDescription>
            {CATEGORY_LABEL[request.category]}
            {request.blood_group ? ` · ${request.blood_group}` : ''} · ring them to arrange a time.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : responders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul className="space-y-2">
            {responders.map((r) => (
              <li key={r.profile_id} className="hairline rounded-sm p-3">
                <p className="font-medium">{r.full_name}</p>
                {r.phone ? (
                  <a
                    href={`tel:${r.phone}`}
                    className="font-mono text-sm underline underline-offset-4"
                  >
                    {r.phone}
                  </a>
                ) : null}
                <p className="font-mono text-xs text-muted-foreground">
                  said yes {formatRelative(r.responded_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
