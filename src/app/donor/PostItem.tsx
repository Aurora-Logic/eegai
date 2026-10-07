import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, Trash2, X } from 'lucide-react'
import { StepMark } from '@/components/illustrations/steps'
import { AppShell } from '@/components/shared/app-shell'
import { PhotoGrid } from '@/components/shared/photo-grid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AreaPicker } from '@/components/shared/area-picker'
import { compressPhoto } from '@/lib/compress'
import { api, ApiError } from '@/lib/api'
import { t, type StringKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  CATEGORY_EXAMPLES,
  detectCategory,
  type GateAnswer,
  CONDITION_GATES,
  donationDraftSchema,
  type Category,
  type Condition,
} from '@/lib/validation/donation'

const DRAFT_KEY = 'eegai.donation-draft'
const STEPS = ['Photos', 'What it is', 'Condition', 'Pickup', 'Review'] as const

/**
 * One line per step, saying why the step exists rather than what the fields are.
 *
 * Read at call time, not at module load, so switching language re-renders these
 * along with everything else.
 */
const stepHints = (): string[] => [
  t('post.photosHint'),
  t('post.detailsHint'),
  t('post.checklistHint'),
  t('post.pickupHint'),
  t('post.reviewHint'),
]

interface Draft {
  title: string
  description: string
  category: Category
  quantity: number
  condition: Condition
  conditionChecklist: Record<string, GateAnswer>
  pickupAddress: string
  pincode: string
  lat?: number
  lng?: number
  photoPaths: string[]
}

/**
 * Where the gates start for a category.
 *
 * The compulsory ones start at yes — the spec asks for that, and most donors
 * are posting things that are genuinely fine. The ones that can be not
 * applicable start unanswered, because "this does not apply" has to be a
 * decision the donor makes, not one made for them.
 */
function startingAnswers(category: Category): Record<string, GateAnswer> {
  const answers: Record<string, GateAnswer> = {}
  for (const gate of CONDITION_GATES[category]) {
    if (!gate.optional) answers[gate.key] = true
  }
  return answers
}

const EMPTY: Draft = {
  title: '',
  description: '',
  category: 'clothing',
  quantity: 1,
  condition: 'good',
  conditionChecklist: startingAnswers('clothing'),
  pickupAddress: '',
  pincode: '',
  photoPaths: [],
}

/** A draft pre-filled from a link, when the query says what it is for. */
function seeded(empty: Draft, params: URLSearchParams): Draft {
  const category = params.get('category')
  const title = params.get('title')
  const known = CATEGORIES.includes(category as Category) ? (category as Category) : null
  if (!known && !title) return empty
  return {
    ...empty,
    ...(known ? { category: known, conditionChecklist: startingAnswers(known) } : {}),
    ...(title ? { title: title.slice(0, 120) } : {}),
  }
}

export default function PostItem() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  // Handed over from "I can give this" on an organisation's request. It seeds
  // an empty draft only: somebody mid-way through posting a sofa should not
  // have it renamed to school bags by a link they tapped by accident.
  const [params] = useSearchParams()
  const [draft, setDraft] = useState<Draft>(() => {
    // A dropped connection must not cost someone their whole post (PLAN.md §M2).
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) return { ...EMPTY, ...(JSON.parse(saved) as Partial<Draft>) }
      return seeded(EMPTY, params)
    } catch {
      return seeded(EMPTY, params)
    }
  })
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])

  const patch = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }))

  const submit = useMutation({
    mutationFn: () => api.post<{ id: string }>('/donations', draft),
    onSuccess: async () => {
      localStorage.removeItem(DRAFT_KEY)
      // Without this the donor lands back on a cached list and their item is
      // simply absent for the next 30 seconds, which reads as "it didn't work".
      await queryClient.invalidateQueries({ queryKey: ['donations'] })
      navigate('/donor', { replace: true })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t('error.generic')),
  })

  async function addPhotos(files: File[]) {
    if (!files.length) return
    setError(null)
    setUploading(true)

    try {
      // The Dropzone already caps the count, but the draft can change between
      // the pick and the upload, so the room is recomputed here.
      const room = 5 - draft.photoPaths.length
      for (const file of files.slice(0, room)) {
        // Compressed before it ever leaves the phone — most donors are on
        // patchy 4G and a 6MB camera shot would simply never arrive.
        const compressed = await compressPhoto(file)
        const { path } = await api.upload<{ path: string }>('/uploads', compressed)
        setDraft((d) => ({ ...d, photoPaths: [...d.photoPaths, path] }))
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That photo would not upload. Try another.')
    } finally {
      setUploading(false)
    }
  }

  // What the name points at, offered rather than applied: a wrong guess filed
  // silently would send the item to the wrong organisations.
  const suggestion = detectCategory(draft.title)
  const gates = CONDITION_GATES[draft.category]
  // A gate passes on yes, or on not-applicable where the gate offers it.
  // Unanswered is not a pass: the compulsory ones start at yes, so the only
  // way to be unanswered is a question the donor was asked to decide.
  const failedGates = gates.filter((g) => {
    const answer = draft.conditionChecklist[g.key]
    return !(answer === true || (g.optional === true && answer === 'na'))
  })
  const parsed = donationDraftSchema.safeParse(draft)

  const canAdvance = [
    draft.photoPaths.length >= 1,
    draft.title.trim().length >= 3,
    failedGates.length === 0,
    /^[1-9][0-9]{5}$/.test(draft.pincode) && draft.pickupAddress.trim().length >= 8,
    parsed.success,
  ]

  return (
    <AppShell title={t('donor.postTitle')} subtitle={STEPS[step]}>
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label}>
            <Badge variant={index === step ? 'tag' : index < step ? 'success' : 'muted'}>
              {index < step ? '✓ ' : ''}
              {label}
            </Badge>
          </li>
        ))}
      </ol>

      {/* The mark and the reason for the step, in one row.
          Five form screens in the same shell look alike enough that people lose
          their place between them; the badges say which one in words, and this
          says it in a shape. The hint used to sit inside two of the five
          sections and be missing from the other three. */}
      <div className="hairline mb-6 flex items-center gap-3 rounded-sm bg-card p-3">
        <StepMark step={step} className="h-11 w-11 shrink-0 text-foreground" />
        <p className="text-sm text-muted-foreground">{stepHints()[step]}</p>
      </div>

      {step === 0 && (
        <section className="space-y-4">
          <PhotoGrid
            paths={draft.photoPaths}
            onReorder={(photoPaths) => patch({ photoPaths })}
            onRemove={(path) => {
              patch({ photoPaths: draft.photoPaths.filter((p) => p !== path) })
              // Fire-and-forget: the draft no longer references it either way,
              // and a failed delete only means the janitorial call gets retried
              // never — an orphan file, which is where we started, not worse.
              void api.delete(`/uploads/${path}`).catch(() => undefined)
            }}
          />

          {draft.photoPaths.length < 5 && (
            <Dropzone
              accept="image/jpeg,image/png,image/webp"
              multiple
              maxFiles={5 - draft.photoPaths.length}
              busy={uploading}
              onFiles={(files) => void addPhotos(files)}
              label={uploading ? t('post.uploading') : t('post.dropLabel')}
              hint={t('post.dropHint', { left: 5 - draft.photoPaths.length })}
            />
          )}

          {error ? (
            <p role="alert" className="hairline rounded-sm bg-card p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t('post.title')}</Label>
            <Input
              id="title"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Winter jackets"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">{t('post.description')}</Label>
            <Textarea
              id="description"
              rows={3}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Anything an NGO should know before claiming it."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category">{t('post.category')}</Label>
            <Select
              value={draft.category}
              // Changing category invalidates the answers to the old gates, and
              // is a decision: it stops the name steering it from then on.
              onValueChange={(v) =>
                patch({
                  category: v as Category,
                  conditionChecklist: startingAnswers(v as Category),
                })
              }
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`category.${c}` as StringKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{CATEGORY_EXAMPLES[draft.category]}</p>
            {suggestion && suggestion !== draft.category ? (
              <p className="text-sm">
                Looks like {t(`category.${suggestion}` as StringKey).toLowerCase()}.{' '}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() =>
                    patch({
                      category: suggestion,
                      conditionChecklist: startingAnswers(suggestion),
                    })
                  }
                >
                  Use that instead
                </button>
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="condition">{t('post.condition')}</Label>
            <Select
              value={draft.condition}
              onValueChange={(v) => patch({ condition: v as Condition })}
            >
              <SelectTrigger id="condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="like_new">Like new</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="usable">Usable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quantity">{t('post.quantity')}</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={500}
              value={draft.quantity}
              onChange={(e) => patch({ quantity: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          {gates.map((gate) => {
            const answer = draft.conditionChecklist[gate.key]
            const answerGate = (value: GateAnswer) =>
              patch({ conditionChecklist: { ...draft.conditionChecklist, [gate.key]: value } })
            return (
              <div key={gate.key} className="hairline rounded-sm bg-card p-3">
                <p className="font-medium">{gate.question}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={answer === true ? 'default' : 'outline'}
                    onClick={() => answerGate(true)}
                  >
                    <Check aria-hidden /> Yes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={answer === false ? 'destructive' : 'outline'}
                    onClick={() => answerGate(false)}
                  >
                    <X aria-hidden /> No
                  </Button>
                  {/* Only where the question can genuinely not apply — a pencil
                      has no packaging. Never the starting answer. */}
                  {gate.optional ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={answer === 'na' ? 'secondary' : 'outline'}
                      onClick={() => answerGate('na')}
                    >
                      <Minus aria-hidden /> Not applicable
                    </Button>
                  ) : null}
                </div>
                {answer === false ? (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {gate.blocks}
                  </p>
                ) : null}
                {answer === undefined ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose one — it does not have to be yes.
                  </p>
                ) : null}
              </div>
            )
          })}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="address">{t('post.address')}</Label>
            <Input
              id="address"
              value={draft.pickupAddress}
              onChange={(e) => patch({ pickupAddress: e.target.value })}
              placeholder="Flat 3, R.S. Puram"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pincode">{t('post.area')}</Label>
            <AreaPicker
              id="pincode"
              value={draft.pincode || undefined}
              // Picking an area also fixes the coordinates, which is what the
              // radius maths runs on. A typed pincode gave us neither.
              onChange={(pincode, area) =>
                patch({ pincode, ...(area ? { lat: area.lat, lng: area.lng } : {}) })
              }
            />
            <p className="text-sm text-muted-foreground">{t('post.areaHint')}</p>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <div className="hairline rounded-sm bg-card p-4">
            <h2 className="font-display text-display-sm">{draft.title}</h2>
            <p className="mt-1 flex gap-2">
              <Badge>{draft.category}</Badge>
              <Badge>{draft.condition.replace('_', ' ')}</Badge>
              <Badge variant="muted">×{draft.quantity}</Badge>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {draft.pickupAddress} · {draft.pincode}
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {draft.photoPaths.length} photo{draft.photoPaths.length === 1 ? '' : 's'}
            </p>
          </div>

          {error ? (
            <p role="alert" className="hairline rounded-sm bg-card p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      )}

      {/* Sticky on a phone: the wizard's steps are long enough to scroll, and the
          way forward should not be somewhere below the fold. Static from sm up,
          where the whole step fits on screen anyway.

          "Start over" sits on its own row rather than beside the primary action.
          At 360px, three controls in a line with a label as long as "Put it on
          the wall" either wrap mid-word or shrink below a thumb's width — and
          the destructive one should not be adjacent to the one people mean. */}
      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="min-h-11 shrink-0"
            onClick={() => (step === 0 ? navigate('/donor') : setStep(step - 1))}
          >
            {step === 0 ? t('action.cancel') : t('action.back')}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              className="min-h-11 flex-1 sm:min-w-32 sm:flex-none"
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance[step]}
            >
              {t('action.next')}
            </Button>
          ) : (
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              onClick={() => submit.mutate()}
              disabled={!parsed.success || submit.isPending}
            >
              {submit.isPending ? 'Posting…' : t('post.submit')}
            </Button>
          )}
        </div>

        {step === 0 && draft.photoPaths.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 min-h-11 text-muted-foreground"
            onClick={() => {
              for (const path of draft.photoPaths) {
                void api.delete(`/uploads/${path}`).catch(() => undefined)
              }
              localStorage.removeItem(DRAFT_KEY)
              setDraft(EMPTY)
              setStep(0)
            }}
          >
            <Trash2 aria-hidden /> Start over
          </Button>
        ) : null}
      </div>

      {step === 2 && failedGates.length > 0 ? (
        <p className={cn('mt-4 text-sm', 'text-muted-foreground')}>{t('post.checklistBlocked')}</p>
      ) : null}
    </AppShell>
  )
}
