import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import imageCompression from 'browser-image-compression'
import { Check, Trash2, X } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { PhotoGrid } from '@/components/shared/photo-grid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Combobox } from '@/components/ui/combobox'
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
import { AREA_BY_PINCODE, areaOptions } from '@/lib/coimbatore'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  CONDITION_GATES,
  donationDraftSchema,
  type Category,
  type Condition,
} from '@/lib/validation/donation'

const DRAFT_KEY = 'wok.donation-draft'
const STEPS = ['Photos', 'What it is', 'Condition', 'Pickup', 'Review'] as const

interface Draft {
  title: string
  description: string
  category: Category
  quantity: number
  condition: Condition
  conditionChecklist: Record<string, boolean>
  pickupAddress: string
  pincode: string
  lat?: number
  lng?: number
  photoPaths: string[]
}

const EMPTY: Draft = {
  title: '',
  description: '',
  category: 'clothes',
  quantity: 1,
  condition: 'good',
  conditionChecklist: {},
  pickupAddress: '',
  pincode: '',
  photoPaths: [],
}

export default function PostItem() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(() => {
    // A dropped connection must not cost someone their whole post (PLAN.md §M2).
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      return saved ? { ...EMPTY, ...(JSON.parse(saved) as Partial<Draft>) } : EMPTY
    } catch {
      return EMPTY
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
    onSuccess: () => {
      localStorage.removeItem(DRAFT_KEY)
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
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: 1600,
          maxSizeMB: 0.4,
          useWebWorker: true,
        })
        const { path } = await api.upload<{ path: string }>('/uploads', compressed as File)
        setDraft((d) => ({ ...d, photoPaths: [...d.photoPaths, path] }))
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That photo would not upload. Try another.')
    } finally {
      setUploading(false)
    }
  }

  const gates = CONDITION_GATES[draft.category]
  const failedGates = gates.filter((g) => draft.conditionChecklist[g.key] !== true)
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

      {step === 0 && (
        <section className="space-y-4">
          <p className="text-muted-foreground">{t('post.photosHint')}</p>

          <PhotoGrid
            paths={draft.photoPaths}
            onReorder={(photoPaths) => patch({ photoPaths })}
            onRemove={(path) => patch({ photoPaths: draft.photoPaths.filter((p) => p !== path) })}
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
              // Changing category invalidates the answers to the old gates.
              onValueChange={(v) => patch({ category: v as Category, conditionChecklist: {} })}
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clothes">Clothes</SelectItem>
                <SelectItem value="books">Books</SelectItem>
                <SelectItem value="toys">Toys</SelectItem>
              </SelectContent>
            </Select>
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
          <p className="text-muted-foreground">{t('post.checklistHint')}</p>

          {gates.map((gate) => {
            const answer = draft.conditionChecklist[gate.key]
            return (
              <div key={gate.key} className="hairline rounded-sm bg-card p-3">
                <p className="font-medium">{gate.question}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={answer === true ? 'default' : 'outline'}
                    onClick={() =>
                      patch({
                        conditionChecklist: { ...draft.conditionChecklist, [gate.key]: true },
                      })
                    }
                  >
                    <Check aria-hidden /> Yes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={answer === false ? 'destructive' : 'outline'}
                    onClick={() =>
                      patch({
                        conditionChecklist: { ...draft.conditionChecklist, [gate.key]: false },
                      })
                    }
                  >
                    <X aria-hidden /> No
                  </Button>
                </div>
                {answer === false ? (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {gate.blocks}
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
            <Combobox
              id="pincode"
              options={areaOptions()}
              value={draft.pincode || undefined}
              // Picking an area also fixes the coordinates, which is what the
              // radius maths runs on. A typed pincode gave us neither.
              onChange={(pincode) => {
                const area = AREA_BY_PINCODE.get(pincode)
                patch({
                  pincode,
                  ...(area ? { lat: area.lat, lng: area.lng } : {}),
                })
              }}
              placeholder={t('post.areaPlaceholder')}
              searchPlaceholder={t('post.areaSearch')}
              emptyText={t('post.areaEmpty')}
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

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? navigate('/donor') : setStep(step - 1))}
        >
          {step === 0 ? t('action.cancel') : t('action.back')}
        </Button>

        <div className="flex gap-2">
          {step === 0 && draft.photoPaths.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY)
                setDraft(EMPTY)
                setStep(0)
              }}
            >
              <Trash2 aria-hidden /> Start over
            </Button>
          ) : null}

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canAdvance[step]}>
              {t('action.next')}
            </Button>
          ) : (
            <Button onClick={() => submit.mutate()} disabled={!parsed.success || submit.isPending}>
              {submit.isPending ? 'Posting…' : t('post.submit')}
            </Button>
          )}
        </div>
      </div>

      {step === 2 && failedGates.length > 0 ? (
        <p className={cn('mt-4 text-sm', 'text-muted-foreground')}>{t('post.checklistBlocked')}</p>
      ) : null}
    </AppShell>
  )
}
