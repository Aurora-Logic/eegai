import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, X } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { FlowDiagram } from '@/components/shared/flow-diagram'
import { ConsentGate } from '@/components/health/consent-gate'
import { OfferList } from '@/components/health/offer-list'
import { PartnerSelect } from '@/components/health/partner-select'
import { YesNo } from '@/components/health/yes-no'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, photoUrl } from '@/lib/api'
import { compressPhoto } from '@/lib/compress'
import { HAIR_FLOW } from '@/lib/flows'
import { healthApi } from '@/lib/health-client'
import { HAIR_CRITERIA, hairOfferSchema, hairWarnings } from '@/lib/validation/health'

/**
 * Hair, offered to a partner organisation the donor picks.
 *
 * The criteria sit beside the form rather than behind a link, because the most
 * expensive mistake here — cutting the hair loose instead of in a ponytail — is
 * made before anybody opens the app a second time.
 */
export default function HairDonor() {
  return (
    <AppShell title="Hair donation" subtitle="For wigs, through a partner organisation you choose.">
      <ConsentGate>
        {/* Full width: the diagram goes horizontal at the md breakpoint of the
            viewport, not of its column, and in half a desktop it overflowed. */}
        <FlowDiagram title="What happens next" steps={HAIR_FLOW} />
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-6">
            <HairForm />
            <section className="space-y-3">
              <h2 className="font-display text-display-sm">What you have sent</h2>
              <OfferList category="hair" />
            </section>
          </div>
          <Criteria />
        </div>
      </ConsentGate>
    </AppShell>
  )
}

function Criteria() {
  return (
    <section className="hairline space-y-2 rounded-sm bg-card p-4">
      <h2 className="font-display text-display-sm">Basic criteria</h2>
      <ul className="space-y-1.5 text-sm">
        {HAIR_CRITERIA.map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        EEGAI connects you to the partner. The partner decides what it can use.
      </p>
    </section>
  )
}

type Answer = boolean | null

function HairForm() {
  const queryClient = useQueryClient()
  const [length, setLength] = useState('')
  const [cleanAndDry, setCleanAndDry] = useState<Answer>(null)
  const [tied, setTied] = useState<Answer>(null)
  const [natural, setNatural] = useState<Answer>(null)
  const [treated, setTreated] = useState<Answer>(null)
  const [ngoId, setNgoId] = useState('')
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const lengthNumber = length === '' ? null : Number(length)
  const warnings = hairWarnings({
    lengthInches: lengthNumber,
    tied,
    natural,
    chemicallyTreated: treated,
  })

  const reset = () => {
    setLength('')
    setCleanAndDry(null)
    setTied(null)
    setNatural(null)
    setTreated(null)
    setNgoId('')
    setPhotoPath(null)
    setErrors({})
  }

  const submit = useMutation({
    mutationFn: (body: unknown) => healthApi.submitOffer(body),
    onSuccess: async () => {
      setFormError(null)
      setSent(true)
      reset()
      await queryClient.invalidateQueries({ queryKey: ['health', 'offers'] })
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  const onSubmit = () => {
    setSent(false)
    const answers = {
      ngoId,
      lengthInches: length,
      cleanAndDry: cleanAndDry === true,
      tied: tied ?? undefined,
      natural: natural ?? undefined,
      chemicallyTreated: treated ?? undefined,
      photoPath,
    }
    const parsed = hairOfferSchema.safeParse(answers)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        next[key] ??= issue.message
      }
      // zod's own wording for a missing boolean is "Required"; say what is missing.
      for (const key of ['tied', 'natural', 'chemicallyTreated'] as const) {
        if (next[key]) next[key] = 'Answer yes or no'
      }
      setErrors(next)
      return
    }
    setErrors({})
    submit.mutate({ category: 'hair', ...parsed.data })
  }

  const addPhoto = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setUploading(true)
    setFormError(null)
    try {
      const compressed = await compressPhoto(file)
      const { path } = await api.upload<{ path: string }>('/uploads', compressed, {
        kind: 'hair',
      })
      setPhotoPath(path)
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'That photo would not upload. Try another.')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = () => {
    // Unattached, so the server lets it go; a failure just leaves a stray file.
    if (photoPath) void api.delete(`/uploads/${photoPath}`).catch(() => undefined)
    setPhotoPath(null)
  }

  return (
    <section className="hairline space-y-4 rounded-sm bg-card p-4">
      <h2 className="font-display text-display-sm">Hair donation form</h2>

      <div className="space-y-1.5">
        <Label htmlFor="hair-length">Length of hair (in inches)</Label>
        <Input
          id="hair-length"
          type="number"
          inputMode="decimal"
          min={1}
          max={60}
          className="w-32"
          value={length}
          onChange={(e) => setLength(e.target.value)}
        />
        {errors['lengthInches'] ? (
          <p className="text-sm text-destructive">{errors['lengthInches']}</p>
        ) : null}
      </div>

      <YesNo
        id="hair-clean"
        label="Is the hair clean & dry?"
        value={cleanAndDry}
        onChange={setCleanAndDry}
        error={errors['cleanAndDry']}
      />
      {cleanAndDry === false ? (
        <p className="text-sm text-destructive">
          Hair must be clean and completely dry before it can be offered.
        </p>
      ) : null}
      <YesNo
        id="hair-tied"
        label="Is the hair tied / braided?"
        value={tied}
        onChange={setTied}
        error={errors['tied']}
      />
      <YesNo
        id="hair-natural"
        label="Is the hair naturally coloured?"
        value={natural}
        onChange={setNatural}
        error={errors['natural']}
      />
      <YesNo
        id="hair-treated"
        label="Is the hair bleached / chemically treated?"
        value={treated}
        onChange={setTreated}
        error={errors['chemicallyTreated']}
      />

      {warnings.length > 0 ? (
        <ul className="space-y-1 rounded-sm bg-muted p-3 text-sm" aria-label="Before you cut">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Upload hair photo (optional)</p>
        {photoPath ? (
          <div className="flex items-center gap-3">
            <img
              src={photoUrl(photoPath)}
              alt="Your hair photo"
              className="size-20 rounded-sm object-cover"
            />
            <Button variant="outline" size="sm" onClick={removePhoto}>
              <X aria-hidden /> Remove
            </Button>
          </div>
        ) : (
          <Dropzone
            accept="image/jpeg,image/png,image/webp"
            maxFiles={1}
            busy={uploading}
            onFiles={(files) => void addPhoto(files)}
            label={uploading ? 'Compressing and uploading…' : 'Take or choose one photo'}
            hint="Only the organisation you send this to will see it."
          />
        )}
      </div>

      <PartnerSelect
        category="hair"
        label="Select partner organisation"
        value={ngoId}
        onChange={setNgoId}
        error={errors['ngoId']}
      />

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      {sent ? (
        <p role="status" className="text-sm text-success">
          Sent. The organisation will review it — you will see its answer below.
        </p>
      ) : null}

      <Button
        className="w-full sm:w-auto"
        disabled={submit.isPending || uploading || cleanAndDry === false}
        onClick={onSubmit}
      >
        {submit.isPending ? 'Sending…' : 'Submit'}
      </Button>
    </section>
  )
}
