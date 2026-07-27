import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import imageCompression from 'browser-image-compression'
import { ArrowLeft, Check, PackageCheck, TriangleAlert, X } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api, photoUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { BrickDonation } from '@/components/wall/brick'

type Outcome = 'receive' | 'reject'

interface TimelineResponse {
  donation: BrickDonation & { title: string; description: string | null; pincode: string | null }
}

/**
 * M6 — the NGO's half of closing the loop.
 *
 * Two outcomes, deliberately not weighted equally. Confirming is one tap plus a
 * photo; rejecting asks for a written reason first, because the donor reads it
 * and "not usable" tells them nothing they can act on next time.
 *
 * Both paths require a photo. For a confirmation it is the thing the donor
 * actually wants to see; for a rejection it is the difference between a record
 * and one party's word against another's.
 */
export default function NgoReceipt() {
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
    queryFn: () => api.get<TimelineResponse>(`/donations/${id}/timeline`),
    enabled: Boolean(id),
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

  return (
    <AppShell
      title="Confirm what arrived"
      subtitle={donation?.title}
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
          That item is not yours, or it no longer exists.
        </p>
      ) : (
        /* One column on a phone, two from tablet up — the item stays visible
           beside the form on a wider screen instead of scrolling away. */
        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="hairline space-y-3 rounded-sm bg-card p-4">
            {donation.photos?.[0] ? (
              <img
                src={photoUrl(donation.photos[0].path)}
                alt={donation.title}
                className="block w-full rounded-sm"
              />
            ) : null}
            <h2 className="font-display text-display-sm leading-tight">{donation.title}</h2>
            <p className="flex flex-wrap gap-1">
              <Badge>{donation.category}</Badge>
              <Badge variant="muted">×{donation.quantity}</Badge>
            </p>
            {donation.description ? (
              <p className="text-sm text-muted-foreground">{donation.description}</p>
            ) : null}
          </section>

          <section className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Did everything arrive usable?</legend>
              {/* Stacked on a phone so each target is full width and unmissable. */}
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
                    {rejecting ? 'Photo of the problem' : 'Photo of the items as they arrived'}
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
                        onClick={() => setPhotoPath(null)}
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
                      label={uploading ? 'Compressing and uploading…' : 'Take or choose one photo'}
                      hint="Only the donor of this item will ever see it."
                    />
                  )}
                </div>

                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

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
          </section>
        </div>
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
