import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import imageCompression from 'browser-image-compression'
import { ArrowLeft, Check, MapPin, PackageCheck, TriangleAlert, X } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { HandoverCodes } from '@/components/shared/handover-codes'
import { PhotoGallery } from '@/components/shared/photo-gallery'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api, photoUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import type { Condition, DonationStatus } from '@/lib/validation/donation'

type Outcome = 'receive' | 'reject'

interface Donation {
  id: string
  title: string
  description: string | null
  category: string
  condition: Condition
  quantity: number
  status: DonationStatus
  pincode: string | null
  pickup_address: string | null
  condition_checklist: Record<string, boolean> | null
  posted_on_behalf_by: string | null
  photos: { path: string }[]
}

const CONDITION_LABEL: Record<Condition, string> = {
  like_new: 'like new',
  good: 'good',
  usable: 'usable',
}

/**
 * One item, seen by the NGO — every photo, everything the donor answered, and
 * whichever action the item's state actually allows.
 *
 * This replaces a screen that only did the acknowledgement step. Two things were
 * wrong with that. An NGO deciding whether to claim saw a single cover photo and
 * no detail, which is a fifth of what the donor took the trouble to provide. And
 * an item in any other state had no screen at all, so there was nowhere to look
 * anything up.
 *
 * One route that adapts, rather than a screen per state: they are the same item,
 * and splitting them would mean the same header, gallery and detail block
 * maintained in three places.
 */
export default function NgoItem() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [note, setNote] = useState('')
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['donations', 'timeline', id],
    queryFn: () => api.get<{ donation: Donation }>(`/donations/${id}/timeline`),
    enabled: Boolean(id),
  })

  const claim = useMutation({
    mutationFn: () => api.post(`/donations/${id}/claim`),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['donations'] })
    },
    onError: (e) =>
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Another organisation claimed this first.'
          : 'That did not go through. Try again.',
      ),
  })

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/acknowledgements/${id}/${outcome}`, { note: note.trim(), photoPath }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['donations'] })
      navigate('/ngo', { replace: true })
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'That did not go through. Try again.'),
  })

  async function addPhoto(files: File[]) {
    const file = files[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 0.4,
        useWebWorker: true,
      })
      const { path } = await api.upload<{ path: string }>('/uploads', compressed as File, {
        kind: 'acknowledgement',
      })
      setPhotoPath(path)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That photo would not upload. Try another.')
    } finally {
      setUploading(false)
    }
  }

  const donation = data?.donation
  const rejecting = outcome === 'reject'
  const noteTooShort = rejecting && note.trim().length < 10
  const canSubmit = Boolean(outcome && photoPath) && !noteTooShort && !submit.isPending
  const arrived = donation?.status === 'received'

  return (
    <AppShell
      title={donation?.title ?? 'Item'}
      subtitle={arrived ? 'Confirm what arrived.' : undefined}
      actions={
        <Button asChild variant="outline">
          <Link to="/ngo">
            <ArrowLeft aria-hidden /> Back
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !donation ? (
        <p role="alert" className="text-destructive">
          That item is not visible to you, or it no longer exists.
        </p>
      ) : (
        /* One column on a phone; the gallery takes the left half from md up so
           the photos stay on screen while the form is being filled in. */
        <>
          <HandoverCodes donationId={donation.id} />

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <PhotoGallery photos={donation.photos ?? []} alt={donation.title} />

              <div className="mt-4 space-y-3">
                <p className="flex flex-wrap gap-1">
                  <Badge>{donation.category}</Badge>
                  <Badge>{CONDITION_LABEL[donation.condition]}</Badge>
                  <Badge variant="muted">×{donation.quantity}</Badge>
                  <Badge variant="outline">{donation.status.replace('_', ' ')}</Badge>
                </p>

                {donation.description ? (
                  <p className="text-pretty text-muted-foreground">{donation.description}</p>
                ) : null}

                <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {donation.pickup_address ?? `Coimbatore ${donation.pincode ?? ''}`}
                </p>

                {donation.condition_checklist &&
                Object.keys(donation.condition_checklist).length > 0 ? (
                  <>
                    <Separator />
                    <div>
                      {/* The gates from §M2, as the donor answered them. This is
                        the single most useful thing on the screen for deciding
                        whether to send a volunteer across the city. */}
                      <h2 className="text-sm font-medium">
                        {donation.posted_on_behalf_by
                          ? 'What the donor confirmed, through an administrator'
                          : 'What the donor confirmed'}
                      </h2>
                      {donation.posted_on_behalf_by ? (
                        // Said plainly. These answers carry less weight than a
                        // donor ticking the boxes with the item in front of
                        // them, and an organisation deciding whether to send a
                        // volunteer is entitled to know which it is.
                        <p className="mt-1 text-xs text-muted-foreground">
                          Recorded by an administrator on the donor&apos;s behalf, not entered by
                          the donor.
                        </p>
                      ) : null}
                      <ul className="mt-2 space-y-1 text-sm">
                        {Object.entries(donation.condition_checklist).map(([key, value]) => (
                          <li key={key} className="flex items-center gap-2">
                            <Badge variant={value ? 'success' : 'destructive'}>
                              {value ? 'yes' : 'no'}
                            </Badge>
                            <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="space-y-5">
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              {donation.status === 'posted' ? (
                <Button
                  className="min-h-11 w-full"
                  disabled={claim.isPending}
                  onClick={() => claim.mutate()}
                >
                  {claim.isPending ? 'Claiming…' : t('action.claim')}
                </Button>
              ) : null}

              {arrived ? (
                <>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">
                      Did everything arrive usable?
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <OutcomeButton
                        selected={outcome === 'receive'}
                        onClick={() => {
                          setOutcome('receive')
                          setError(null)
                        }}
                        icon={<PackageCheck className="size-5" aria-hidden />}
                        title="Yes, it's all here"
                        body="The donor sees this, and their item is complete."
                        tone="good"
                      />
                      <OutcomeButton
                        selected={outcome === 'reject'}
                        onClick={() => {
                          setOutcome('reject')
                          setError(null)
                        }}
                        icon={<TriangleAlert className="size-5" aria-hidden />}
                        title="Something's wrong"
                        body="Tell the donor what, so the next one is right."
                        tone="bad"
                      />
                    </div>
                  </fieldset>

                  {outcome ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="ack-note">
                          {rejecting ? 'What is wrong?' : 'A line for the donor (optional)'}
                        </Label>
                        <Textarea
                          id="ack-note"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={4}
                          maxLength={1000}
                          placeholder={
                            rejecting
                              ? 'Three of the six shirts were torn at the seam.'
                              : 'These went to the children at our Ganapathy centre.'
                          }
                        />
                        <p
                          className={cn(
                            'text-xs',
                            noteTooShort && note.length > 0
                              ? 'text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {rejecting
                            ? 'At least a sentence. This is what the donor reads.'
                            : 'Say where they went. This is the part donors remember.'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>
                          {rejecting
                            ? 'Photo of the problem'
                            : 'Photo of the items as they arrived'}
                        </Label>

                        {photoPath ? (
                          <div className="hairline relative overflow-hidden rounded-sm">
                            <img
                              src={photoUrl(photoPath)}
                              alt="The photo you are about to send"
                              className="block w-full"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void api.delete(`/uploads/${photoPath}`).catch(() => undefined)
                                setPhotoPath(null)
                              }}
                              className="absolute right-2 top-2 rounded-sm bg-background/90 p-2 hover:bg-background"
                              aria-label="Remove this photo"
                            >
                              <X className="size-4" aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <Dropzone
                            accept="image/jpeg,image/png,image/webp"
                            maxFiles={1}
                            busy={uploading}
                            onFiles={(files) => void addPhoto(files)}
                            label={
                              uploading ? 'Compressing and uploading…' : 'Take or choose one photo'
                            }
                            hint="Only the donor of this item will ever see it."
                          />
                        )}
                      </div>

                      {/* Sticky on a phone so the action never scrolls out of thumb
                        reach on a long form; static once there is room for it. */}
                      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
                        <Button
                          className="min-h-11 w-full"
                          variant={rejecting ? 'destructive' : 'default'}
                          disabled={!canSubmit}
                          onClick={() => submit.mutate()}
                        >
                          {submit.isPending ? (
                            'Sending…'
                          ) : rejecting ? (
                            'Send this back to the donor'
                          ) : (
                            <>
                              <Check aria-hidden /> Confirm it arrived
                            </>
                          )}
                        </Button>
                        {!photoPath ? (
                          <p className="mt-2 text-center text-xs text-muted-foreground">
                            Add a photo to finish.
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </>
              ) : donation.status !== 'posted' ? (
                <p className="text-muted-foreground">
                  Nothing to do here yet. This item is {donation.status.replace('_', ' ')}.
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}

/** A radio in all but name — large enough to hit with a thumb, and self-describing. */
function OutcomeButton({
  selected,
  onClick,
  icon,
  title,
  body,
  tone,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  body: string
  tone: 'good' | 'bad'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'hairline flex min-h-11 w-full items-start gap-3 rounded-sm bg-card p-3 text-left transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected && tone === 'good' && 'outline outline-2 outline-primary',
        selected && tone === 'bad' && 'outline outline-2 outline-destructive',
        !selected && 'hover:bg-foreground/5',
      )}
    >
      <span className={cn('mt-0.5', tone === 'bad' ? 'text-destructive' : 'text-primary')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  )
}
