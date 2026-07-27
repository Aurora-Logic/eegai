import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import imageCompression from 'browser-image-compression'
import { PackagePlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { ApiError, api, photoUrl } from '@/lib/api'
import { t, type StringKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  CONDITION_GATES,
  type Category,
  type Condition,
} from '@/lib/validation/donation'

interface Person {
  id: string
  full_name: string
  phone: string | null
  is_active: boolean
}

/**
 * Posting an item for a donor who is not online — someone who walked in, or
 * telephoned.
 *
 * The condition gates are asked here exactly as they are asked of a donor, and
 * the server validates them with the same schema, so coming through the admin
 * door cannot skip them. What changes is only the record: the item belongs to
 * the donor, and the row also says an administrator asserted the answers. An
 * organisation sees that difference before it decides to send a volunteer.
 */
export function AddItemDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [donorId, setDonorId] = useState('')
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    category: 'clothes' as Category,
    quantity: 1,
    condition: 'good' as Condition,
    pickupAddress: '',
    pincode: '',
  })
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [photoPaths, setPhotoPaths] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const donors = useQuery({
    queryKey: ['admin', 'users', 'donor'],
    queryFn: () => api.get<{ users: Person[] }>('/admin/users?role=donor'),
    enabled: open,
  })

  const gates = CONDITION_GATES[draft.category]
  const unanswered = gates.filter((gate) => checklist[gate.key] !== true)

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/admin/donations', {
        donorId,
        ...draft,
        description: draft.description.trim() || undefined,
        conditionChecklist: checklist,
        photoPaths,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      reset()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That item could not be posted.'),
  })

  function reset() {
    setOpen(false)
    setDonorId('')
    setDraft({
      title: '',
      description: '',
      category: 'clothes',
      quantity: 1,
      condition: 'good',
      pickupAddress: '',
      pincode: '',
    })
    setChecklist({})
    setPhotoPaths([])
    setError(null)
  }

  async function addPhotos(files: File[]) {
    setUploading(true)
    setError(null)
    try {
      for (const file of files.slice(0, 5 - photoPaths.length)) {
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: 1600,
          maxSizeMB: 0.4,
          useWebWorker: true,
        })
        const { path } = await api.upload<{ path: string }>('/uploads', compressed as File)
        setPhotoPaths((current) => [...current, path])
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That photo would not upload.')
    } finally {
      setUploading(false)
    }
  }

  const valid =
    donorId !== '' &&
    draft.title.trim().length >= 3 &&
    draft.pickupAddress.trim().length >= 8 &&
    /^[1-9][0-9]{5}$/.test(draft.pincode) &&
    photoPaths.length >= 1 &&
    unanswered.length === 0

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <PackagePlus aria-hidden /> Post an item
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post an item for a donor</DialogTitle>
          <DialogDescription>
            For someone who walked in or telephoned. The item will be theirs, and the record will
            show you answered the condition questions on their behalf.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="item-donor">Whose item is this?</Label>
          <Select value={donorId} onValueChange={setDonorId}>
            <SelectTrigger id="item-donor">
              <SelectValue placeholder="Choose a donor" />
            </SelectTrigger>
            <SelectContent>
              {(donors.data?.users ?? [])
                .filter((person) => person.is_active)
                .map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.full_name} · {person.phone ?? '—'}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="item-title">What is it?</Label>
          <Input
            id="item-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Winter jackets"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="item-category">Category</Label>
            <Select
              value={draft.category}
              onValueChange={(value) => {
                setDraft({ ...draft, category: value as Category })
                // The gates differ per category, so old answers do not carry over.
                setChecklist({})
              }}
            >
              <SelectTrigger id="item-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {t(`category.${category}` as StringKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-qty">How many?</Label>
            <Input
              id="item-qty"
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 1 })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="item-address">Pickup address</Label>
            <Input
              id="item-address"
              value={draft.pickupAddress}
              onChange={(e) => setDraft({ ...draft, pickupAddress: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-pin">Pincode</Label>
            <Input
              id="item-pin"
              inputMode="numeric"
              value={draft.pincode}
              onChange={(e) => setDraft({ ...draft, pincode: e.target.value })}
            />
          </div>
        </div>

        {/* Asked in full, not summarised. These are the gates from §M2 and the
            server validates them with the same schema a donor's post goes
            through — the admin door does not skip them. */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Ask the donor each of these
            {unanswered.length > 0 ? (
              <Badge variant="muted" className="ml-2">
                {unanswered.length} left
              </Badge>
            ) : null}
          </legend>
          {gates.map((gate) => (
            <label
              key={gate.key}
              className={cn(
                'hairline flex min-h-11 cursor-pointer items-center gap-3 rounded-sm bg-card p-3 text-sm',
                checklist[gate.key] === true && 'outline outline-2 outline-primary',
              )}
            >
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-[hsl(var(--marigold))]"
                checked={checklist[gate.key] === true}
                onChange={(e) => setChecklist({ ...checklist, [gate.key]: e.target.checked })}
              />
              <span>{gate.question}</span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-2">
          <Label>Photos</Label>
          {photoPaths.length > 0 ? (
            <ul className="grid grid-cols-4 gap-2">
              {photoPaths.map((path) => (
                <li key={path} className="hairline overflow-hidden rounded-sm">
                  <img src={photoUrl(path)} alt="" className="block aspect-square object-cover" />
                </li>
              ))}
            </ul>
          ) : null}
          {photoPaths.length < 5 ? (
            <Dropzone
              accept="image/jpeg,image/png,image/webp"
              multiple
              maxFiles={5 - photoPaths.length}
              busy={uploading}
              onFiles={(files) => void addPhotos(files)}
              label={uploading ? 'Uploading…' : 'Add photos of the item'}
              hint={`At least one. ${5 - photoPaths.length} more allowed.`}
            />
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={reset}>
            Cancel
          </Button>
          <Button
            className="min-h-11 w-full sm:w-auto"
            disabled={!valid || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Posting…' : 'Put it on the wall'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
