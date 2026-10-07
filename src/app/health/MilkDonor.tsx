import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/shared/app-shell'
import { FlowDiagram } from '@/components/shared/flow-diagram'
import { ConsentGate } from '@/components/health/consent-gate'
import { OfferList } from '@/components/health/offer-list'
import { PartnerSelect } from '@/components/health/partner-select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ApiError } from '@/lib/api'
import { MILK_FLOW } from '@/lib/flows'
import { healthApi } from '@/lib/health-client'
import { MILK_ELIGIBILITY, milkOfferSchema, type MilkKey } from '@/lib/validation/health'

/**
 * Breast milk, per the spec: eligibility and consent here, screening at a
 * Lactation Management Centre, and the donation there.
 *
 * Every point is the mother's own declaration. The submit stays disabled until
 * all seven are ticked, which is the whole of the check — this app screens
 * nobody.
 */
export default function MilkDonor() {
  return (
    <AppShell
      title="Breast milk donation"
      subtitle="Through a Lactation Management Centre (LMC / CLMC)."
    >
      <ConsentGate>
        <div className="space-y-6">
          <FlowDiagram title="How it works" steps={MILK_FLOW} />
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <MilkForm />
            <section className="space-y-3">
              <h2 className="font-display text-display-sm">Your registrations</h2>
              <OfferList category="breast_milk" />
            </section>
          </div>
        </div>
      </ConsentGate>
    </AppShell>
  )
}

const NONE = Object.fromEntries(MILK_ELIGIBILITY.map((p) => [p.key, false])) as Record<
  MilkKey,
  boolean
>

function MilkForm() {
  const queryClient = useQueryClient()
  const [ticked, setTicked] = useState<Record<MilkKey, boolean>>(NONE)
  const [ngoId, setNgoId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const all = MILK_ELIGIBILITY.every((p) => ticked[p.key])

  const submit = useMutation({
    mutationFn: () => {
      const parsed = milkOfferSchema.safeParse({ ngoId, ...ticked })
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Check the form.')
      }
      return healthApi.submitOffer({ category: 'breast_milk', ...parsed.data })
    },
    onSuccess: async () => {
      setError(null)
      setSent(true)
      setTicked(NONE)
      setNgoId('')
      await queryClient.invalidateQueries({ queryKey: ['health', 'offers'] })
    },
    onError: (e) =>
      setError(
        e instanceof ApiError || e instanceof Error ? e.message : 'That did not go through.',
      ),
  })

  return (
    <section className="hairline space-y-4 rounded-sm bg-card p-4">
      <h2 className="font-display text-display-sm">Basic eligibility</h2>
      <fieldset className="space-y-1">
        <legend className="sr-only">Confirm each point</legend>
        {MILK_ELIGIBILITY.map((point) => (
          <label
            key={point.key}
            htmlFor={`milk-${point.key}`}
            className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-sm"
          >
            <Checkbox
              id={`milk-${point.key}`}
              className="mt-0.5"
              checked={ticked[point.key]}
              onCheckedChange={(v) => {
                setSent(false)
                setTicked({ ...ticked, [point.key]: v === true })
              }}
            />
            <span>{point.label}</span>
          </label>
        ))}
      </fieldset>

      <PartnerSelect
        category="breast_milk"
        label="Lactation Management Centre"
        value={ngoId}
        onChange={setNgoId}
      />

      <p className="text-xs text-muted-foreground">
        The centre screens and tests. EEGAI only passes your name and phone to the centre you
        choose.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p role="status" className="text-sm text-success">
          Registered. The centre will contact you for screening.
        </p>
      ) : null}

      <Button
        className="w-full sm:w-auto"
        disabled={!all || !ngoId || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? 'Sending…' : 'Register with the centre'}
      </Button>
      {!all ? (
        <p className="text-xs text-muted-foreground">Every point must be confirmed.</p>
      ) : null}
    </section>
  )
}
