import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { CATEGORY_LABEL, HEALTH_CATEGORIES } from '@/lib/validation/health'
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
import { Switch } from '@/components/ui/switch'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CATEGORIES } from '@/lib/validation/donation'

export interface EditableNgo {
  id: string
  name: string
  registration_number: string | null
  darpan_id: string | null
  has_80g: boolean
  address: string | null
  pincode: string | null
  monthly_capacity: number
  accepts_categories: string[]
  contact_person: string | null
  contact_phone: string | null
  is_accepting: boolean
  health_categories?: string[] | null
  visit_instructions?: string | null
}

/**
 * Editing an organisation's record (PLAN.md §M7).
 *
 * Verification status is deliberately absent. That moves through Approve /
 * Reject / Suspend, which record a reason in the audit trail — two doors to the
 * same state is how one of them ends up without the paperwork.
 *
 * Only changed fields are sent. A PATCH that echoes every value back would
 * overwrite a field an operator never looked at with whatever was on screen
 * when they opened the dialog, which is how two admins editing at once quietly
 * undo each other.
 */
export function EditNgoDialog({ ngo, onClose }: { ngo: EditableNgo; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState({
    name: ngo.name,
    registrationNumber: ngo.registration_number ?? '',
    darpanId: ngo.darpan_id ?? '',
    address: ngo.address ?? '',
    pincode: ngo.pincode ?? '',
    contactPerson: ngo.contact_person ?? '',
    contactPhone: ngo.contact_phone ?? '',
    monthlyCapacity: ngo.monthly_capacity,
    has80g: ngo.has_80g,
    isAccepting: ngo.is_accepting,
    acceptsCategories: ngo.accepts_categories,
    healthCategories: ngo.health_categories ?? [],
    visitInstructions: ngo.visit_instructions ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {}
      const text = (value: string) => (value.trim() === '' ? null : value.trim())

      if (draft.name.trim() !== ngo.name) patch.name = draft.name.trim()
      if (text(draft.registrationNumber) !== ngo.registration_number)
        patch.registrationNumber = text(draft.registrationNumber)
      if (text(draft.darpanId) !== ngo.darpan_id) patch.darpanId = text(draft.darpanId)
      if (text(draft.address) !== ngo.address) patch.address = text(draft.address)
      if (text(draft.pincode) !== ngo.pincode) patch.pincode = text(draft.pincode)
      if (text(draft.contactPerson) !== ngo.contact_person)
        patch.contactPerson = text(draft.contactPerson)
      if (text(draft.contactPhone) !== ngo.contact_phone)
        patch.contactPhone = text(draft.contactPhone)
      if (draft.monthlyCapacity !== ngo.monthly_capacity)
        patch.monthlyCapacity = draft.monthlyCapacity
      if (draft.has80g !== ngo.has_80g) patch.has80g = draft.has80g
      if (draft.isAccepting !== ngo.is_accepting) patch.isAccepting = draft.isAccepting
      if (draft.acceptsCategories.join() !== ngo.accepts_categories.join())
        patch.acceptsCategories = draft.acceptsCategories
      if (draft.healthCategories.join() !== (ngo.health_categories ?? []).join())
        patch.healthCategories = draft.healthCategories
      if (text(draft.visitInstructions) !== (ngo.visit_instructions ?? null))
        patch.visitInstructions = text(draft.visitInstructions)

      if (Object.keys(patch).length === 0) {
        return Promise.reject(new ApiError(400, 'Nothing has changed.'))
      }
      return api.patch(`/admin/ngos/${ngo.id}`, patch)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not save. Try again.'),
  })

  function toggleCategory(category: string) {
    setDraft((d) => {
      const next = d.acceptsCategories.includes(category)
        ? d.acceptsCategories.filter((c) => c !== category)
        : [...d.acceptsCategories, category]
      // An organisation accepting nothing would vanish from every wall without
      // any signal that it had — that is what the pause switch is for.
      return next.length === 0 ? d : { ...d, acceptsCategories: next }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {ngo.name}</DialogTitle>
          <DialogDescription>
            Verification is not changed here — use Approve, Reject or Suspend, which record a
            reason.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label="Name" id="ngo-name">
            <Input
              id="ngo-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Registration number" id="ngo-reg">
              <Input
                id="ngo-reg"
                value={draft.registrationNumber}
                onChange={(e) => setDraft((d) => ({ ...d, registrationNumber: e.target.value }))}
              />
            </Field>
            <Field label="DARPAN id" id="ngo-darpan">
              <Input
                id="ngo-darpan"
                value={draft.darpanId}
                onChange={(e) => setDraft((d) => ({ ...d, darpanId: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Address" id="ngo-address">
            <Input
              id="ngo-address"
              value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pincode" id="ngo-pin">
              <Input
                id="ngo-pin"
                inputMode="numeric"
                value={draft.pincode}
                onChange={(e) => setDraft((d) => ({ ...d, pincode: e.target.value }))}
              />
            </Field>
            <Field label="Items per month" id="ngo-cap">
              <Input
                id="ngo-cap"
                type="number"
                min={0}
                value={draft.monthlyCapacity}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, monthlyCapacity: Number(e.target.value) || 0 }))
                }
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact person" id="ngo-person">
              <Input
                id="ngo-person"
                value={draft.contactPerson}
                onChange={(e) => setDraft((d) => ({ ...d, contactPerson: e.target.value }))}
              />
            </Field>
            <Field label="Contact phone" id="ngo-phone">
              <Input
                id="ngo-phone"
                inputMode="tel"
                value={draft.contactPhone}
                onChange={(e) => setDraft((d) => ({ ...d, contactPhone: e.target.value }))}
              />
            </Field>
          </div>

          <div>
            <Label className="mb-1.5 block">Accepts</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => {
                const on = draft.acceptsCategories.includes(category)
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCategory(category)}
                    className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Badge variant={on ? 'tag' : 'outline'} className={cn(!on && 'opacity-60')}>
                      {category}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Brief §5: only verified institutions can post or broadcast, and
              which categories is an admin decision. An organisation cannot
              grant itself blood, so this control exists only here.

              Empty is the normal state — most organisations on this platform
              collect clothes and books and have nothing to do with the health
              lane. */}
          <div>
            <Label className="mb-1.5 block">May request health donations</Label>
            <div className="flex flex-wrap gap-1.5">
              {HEALTH_CATEGORIES.map((category) => {
                const on = draft.healthCategories.includes(category)
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Allow ${CATEGORY_LABEL[category]} requests`}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        healthCategories: on
                          ? d.healthCategories.filter((c) => c !== category)
                          : [...d.healthCategories, category],
                      }))
                    }
                    className="inline-flex min-h-11 items-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Badge variant={on ? 'tag' : 'outline'} className={cn(!on && 'opacity-60')}>
                      {CATEGORY_LABEL[category]}
                    </Badge>
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave empty unless this is a hospital, blood centre or milk bank you have checked.
            </p>
          </div>

          {draft.healthCategories.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="visit-instructions">Where a donor should go</Label>
              <Textarea
                id="visit-instructions"
                rows={2}
                value={draft.visitInstructions}
                onChange={(e) => setDraft((d) => ({ ...d, visitInstructions: e.target.value }))}
                placeholder="Reception, Block B. Bring photo ID."
              />
              <p className="text-xs text-muted-foreground">
                Shown to a donor only after they say yes.
              </p>
            </div>
          ) : null}

          <label className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm">Has 80G registration</span>
            <Switch
              checked={draft.has80g}
              onCheckedChange={(has80g) => setDraft((d) => ({ ...d, has80g }))}
            />
          </label>

          <label className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm">
              Currently accepting
              <span className="block text-xs text-muted-foreground">
                Off hides their wall without touching verification.
              </span>
            </span>
            <Switch
              checked={draft.isAccepting}
              onCheckedChange={(isAccepting) => setDraft((d) => ({ ...d, isAccepting }))}
            />
          </label>

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
          <Button className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
