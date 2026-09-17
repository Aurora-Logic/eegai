import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Users } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { EmptyState } from '@/components/shared/empty-state'
import { GuideCard } from '@/components/shared/guide-card'
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
import { OFFER_VARIANT } from '@/lib/offer-status'
import { ApiError, photoUrl } from '@/lib/api'
import { formatRelative } from '@/lib/dates'
import { healthApi, type IncomingOffer, type OwnRequest } from '@/lib/health-client'
import {
  BLOOD_GROUPS,
  CATEGORY_LABEL,
  GENDER_LABEL,
  MILK_ELIGIBILITY,
  OFFER_STATUS_LABEL,
  URGENCIES,
  URGENCY_LABEL,
  healthRequestSchema,
  type BloodGroup,
  type OfferStatus,
  type Urgency,
} from '@/lib/validation/health'

/**
 * An organisation's half of the health lane, in two parts per the spec.
 *
 * A hospital posts blood alerts and rings the donors who said Available. A
 * partner organisation receives hair and breast-milk offers and moves them
 * along. One organisation can be both, so the screen shows whichever parts an
 * admin has approved it for.
 *
 * Nothing here schedules, collects or transports anything. Brief §6 puts all of
 * that with the organisation, so the app's job ends at "these people can come,
 * here are their numbers".
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
  const categories = standing?.health_categories ?? []
  const blood = categories.includes('blood')
  const offers = categories.includes('hair') || categories.includes('breast_milk')
  const hospital = standing?.org_type === 'hospital'

  // Brief §5: only verified organisations can reach donors, and only in the
  // categories an admin approved. Saying which of those is missing beats a
  // button that fails.
  const blocker = !standing
    ? null
    : standing.verification_status !== 'verified'
      ? {
          title: 'Your organisation is not verified yet',
          body: 'An administrator is checking your papers. Everything here opens as soon as that is done — nothing is needed from you.',
        }
      : categories.length === 0
        ? {
            title: 'Not approved for health donations yet',
            body: hospital
              ? 'An administrator turns on blood alerts for each hospital. Ring us if this has taken more than a day.'
              : 'An administrator approves hair or breast-milk offers per organisation. Ring us if you are a partner and this looks wrong.',
          }
        : null
  const cannotPost = blood && standing && !standing.has_location
  const canPost = !blocker && blood && !cannotPost

  return (
    <AppShell
      title={blood ? 'Blood alerts' : 'Donor offers'}
      subtitle={
        blood
          ? 'Post a blood alert. Every registered blood donor is told.'
          : 'Hair and breast milk offered to you by donors.'
      }
      actions={
        canPost ? (
          <Button onClick={() => setPosting(true)}>
            <Megaphone aria-hidden /> Post a blood alert
          </Button>
        ) : null
      }
    >
      {blocker ? (
        <div className="hairline mb-6 rounded-sm border-primary/40 bg-card p-4">
          <p className="font-display text-display-sm">{blocker.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{blocker.body}</p>
        </div>
      ) : null}

      {!blocker && cannotPost ? (
        <div className="hairline mb-6 rounded-sm border-primary/40 bg-card p-4">
          <p className="font-display text-display-sm">Your address has no location on it</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Donors are shown how far away you are, so an alert cannot go out without one. An
            administrator can set it.
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : blocker ? null : (
        <div className="space-y-8">
          {blood ? (
            requests.length === 0 ? (
              <EmptyState
                title="No blood alerts yet"
                hint="Post one and every registered, available blood donor is told. You will see how many."
                action={
                  canPost ? (
                    <Button onClick={() => setPosting(true)}>Post a blood alert</Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-6">
                <Section title="Open" requests={open} onView={setViewing} />
                {past.length > 0 ? (
                  <Section title="Closed" requests={past} onView={setViewing} />
                ) : null}
              </div>
            )
          ) : null}

          {offers ? <IncomingOffers /> : null}
        </div>
      )}

      <GuideCard className="mt-6" />
      <Disclosure className="mt-4" />

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
              <strong>{r.responses_count}</strong> available of {r.donors_needed}{' '}
              {r.donors_needed === 1 ? 'unit' : 'units'} required
              {r.not_available_count > 0 ? ` · ${r.not_available_count} not available` : ''}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              asked {formatRelative(r.created_at)}
              {r.status === 'open' ? ` · closes ${formatRelative(r.expires_at)}` : ''}
            </p>
            {r.note ? <p className="mt-2 text-sm text-muted-foreground">{r.note}</p> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onView(r)}>
                <Users aria-hidden /> Available donors ({r.responses_count})
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
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('')
  const [urgency, setUrgency] = useState<Urgency>('urgent')
  const [units, setUnits] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notified, setNotified] = useState<number | null>(null)

  const post = useMutation({
    mutationFn: () => {
      const parsed = healthRequestSchema.safeParse({
        category: 'blood',
        bloodGroup: bloodGroup || undefined,
        urgency,
        donorsNeeded: units,
        note: note.trim() || undefined,
      })
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the form.')
      return healthApi.postRequest(parsed.data)
    },
    onSuccess: async (result) => {
      setNotified(result.notified)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['health'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not go through.'),
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{notified === null ? 'Post a blood alert' : 'Alert sent'}</DialogTitle>
          <DialogDescription>
            {notified === null
              ? 'Every registered blood donor who is available is told. The ones who can come appear here with their number.'
              : // The count, and nothing else. Brief §5: the institution never
                // learns who was told.
                `${notified} ${notified === 1 ? 'donor was' : 'donors were'} alerted.`}
          </DialogDescription>
        </DialogHeader>

        {notified !== null ? (
          <Button className="min-h-11" onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="need-group">Blood group</Label>
                <Select value={bloodGroup} onValueChange={(v) => setBloodGroup(v as BloodGroup)}>
                  <SelectTrigger id="need-group">
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
                <Label htmlFor="need-count">Units required</Label>
                <Input
                  id="need-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
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
              disabled={post.isPending || !bloodGroup}
              onClick={() => post.mutate()}
            >
              {post.isPending ? 'Sending…' : 'Send the alert'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The donors who said Available.
 *
 * What the spec lets a hospital see and nothing that places them: there is no
 * address and no map, because the database function returns none — this
 * screen could not show a location even if somebody added the markup.
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
          <DialogTitle>Available donors</DialogTitle>
          <DialogDescription>
            {request.blood_group} · ring them to arrange a time.
            {request.not_available_count > 0
              ? ` ${request.not_available_count} said not available.`
              : ''}
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
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.full_name}</span>
                  {r.blood_group ? (
                    <Badge variant="tag" className="font-mono">
                      {r.blood_group}
                    </Badge>
                  ) : null}
                </p>
                {r.phone ? (
                  <a
                    href={`tel:${r.phone}`}
                    className="font-mono text-sm underline underline-offset-4"
                  >
                    {r.phone}
                  </a>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {[
                    r.age ? `${r.age} yrs` : null,
                    r.gender ? GENDER_LABEL[r.gender] : null,
                    r.last_blood_donation
                      ? `last donated ${formatDate(r.last_blood_donation)}`
                      : 'no previous donation given',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  available since {formatRelative(r.responded_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A YYYY-MM-DD as a date, without a timezone getting a chance to move it. */
function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Hair and breast-milk offers sent to this organisation.
 *
 * Moves are the ones the database allows, and nothing else is offered: a
 * button the server would refuse is a question the screen should not ask.
 */
function IncomingOffers() {
  const queryClient = useQueryClient()
  const [declining, setDeclining] = useState<IncomingOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['health', 'offers', 'incoming'],
    queryFn: healthApi.incomingOffers,
  })

  const decide = useMutation({
    mutationFn: (v: { id: string; status: OfferStatus; note?: string }) =>
      healthApi.decideOffer(v.id, v.status, v.note),
    onSuccess: async () => {
      setError(null)
      setDeclining(null)
      await queryClient.invalidateQueries({ queryKey: ['health', 'offers'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  const offers = data?.offers ?? []
  const waiting = offers.filter((o) => ['submitted', 'in_review', 'accepted'].includes(o.status))
  const done = offers.filter((o) => !waiting.includes(o))

  return (
    <section className="space-y-3">
      <h2 className="font-display text-display-md">Offers from donors</h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : offers.length === 0 ? (
        <EmptyState
          title="No offers yet"
          hint="When a donor chooses you for hair or breast milk, it arrives here with their answers and number."
        />
      ) : (
        <>
          <ul className="space-y-3" aria-label="Offers waiting">
            {waiting.map((o) => (
              <OfferCard
                key={o.offer_id}
                offer={o}
                busy={decide.isPending}
                onMove={(status) => decide.mutate({ id: o.offer_id, status })}
                onDecline={() => setDeclining(o)}
              />
            ))}
          </ul>
          {done.length > 0 ? (
            <>
              <h3 className="pt-2 font-display text-display-sm">Finished</h3>
              <ul className="space-y-3" aria-label="Finished offers">
                {done.map((o) => (
                  <OfferCard key={o.offer_id} offer={o} busy />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      {declining ? (
        <DeclineDialog
          offer={declining}
          busy={decide.isPending}
          onClose={() => setDeclining(null)}
          onDecline={(note) => decide.mutate({ id: declining.offer_id, status: 'declined', note })}
        />
      ) : null}
    </section>
  )
}

const HAIR_ANSWERS: [string, string][] = [
  ['cleanAndDry', 'Clean & dry'],
  ['tied', 'Tied / braided'],
  ['natural', 'Naturally coloured'],
  ['chemicallyTreated', 'Bleached / treated'],
]

function OfferCard({
  offer,
  busy,
  onMove,
  onDecline,
}: {
  offer: IncomingOffer
  busy: boolean
  onMove?: (status: OfferStatus) => void
  onDecline?: () => void
}) {
  const d = offer.details
  const hair = offer.category === 'hair'

  return (
    <li className="hairline rounded-sm bg-card p-4">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{offer.donor_name}</span>
        <Badge variant="outline">{CATEGORY_LABEL[offer.category]}</Badge>
        <Badge variant={OFFER_VARIANT[offer.status]}>
          {OFFER_STATUS_LABEL[offer.category][offer.status]}
        </Badge>
      </p>
      {offer.donor_phone ? (
        <a
          href={`tel:${offer.donor_phone}`}
          className="font-mono text-sm underline underline-offset-4"
        >
          {offer.donor_phone}
        </a>
      ) : null}

      {hair ? (
        <div className="mt-2 flex flex-wrap items-start gap-3">
          {offer.photo_path ? (
            <a href={photoUrl(offer.photo_path)} target="_blank" rel="noreferrer">
              <img
                src={photoUrl(offer.photo_path)}
                alt={`Hair offered by ${offer.donor_name}`}
                className="size-20 rounded-sm object-cover"
              />
            </a>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Length</dt>
            <dd>{String(d['lengthInches'])} in</dd>
            {HAIR_ANSWERS.map(([key, label]) => (
              <Fragment key={key}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{d[key] === true ? 'Yes' : d[key] === false ? 'No' : '—'}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          All {MILK_ELIGIBILITY.length} eligibility points confirmed by the mother. Screening is
          yours.
        </p>
      )}

      {offer.org_note ? (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Your note:</span> {offer.org_note}
        </p>
      ) : null}
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        sent {formatRelative(offer.created_at)}
      </p>

      {onMove ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {offer.status === 'submitted' ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onMove('in_review')}>
              {hair ? 'Checking it' : 'Screening'}
            </Button>
          ) : null}
          {offer.status !== 'accepted' ? (
            <Button size="sm" disabled={busy} onClick={() => onMove('accepted')}>
              {hair ? 'Accept' : 'Cleared to donate'}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onMove('completed')}>
              {hair ? 'Mark received' : 'Mark donated'}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={onDecline}>
            Decline
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function DeclineDialog({
  offer,
  busy,
  onClose,
  onDecline,
}: {
  offer: IncomingOffer
  busy: boolean
  onClose: () => void
  onDecline: (note: string) => void
}) {
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline {offer.donor_name}’s offer?</DialogTitle>
          <DialogDescription>
            Say why. The donor sees this, and a reason is the difference between a no and a mystery.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="decline-note">Reason</Label>
        <Textarea
          id="decline-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="We need at least 12 inches for a full wig."
        />
        <Button
          variant="destructive"
          className="min-h-11"
          disabled={busy || note.trim().length === 0}
          onClick={() => onDecline(note.trim())}
        >
          Decline with this reason
        </Button>
      </DialogContent>
    </Dialog>
  )
}
