import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { REQUIRED_DISCLOSURE } from '@/components/health/disclosure'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { healthApi } from '@/lib/health-client'

/**
 * What a donor agrees to, in the spec's own terms.
 *
 * One list, rendered here and on the preferences screen, so the words on the
 * gate and the words somebody can re-read later are the same words.
 */
export const CONSENT_TERMS = [
  'EEGAI connects you with verified hospitals and organisations. It does not collect, store, test or screen anything — the organisation does, in person.',
  'Your area is used to show how far away a hospital is. Your exact location is never shown to anybody.',
  'A hospital sees your name, phone, age, gender, blood group and last donation date only after you say Available. A partner organisation sees your name and phone only when you send it an offer.',
  'Every hospital and organisation is verified by an administrator before it can reach you.',
  'You can withdraw this at any time from Preferences.',
] as const

export function ConsentTerms() {
  return (
    <>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {CONSENT_TERMS.map((term) => (
          <li key={term} className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{term}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{REQUIRED_DISCLOSURE}</p>
    </>
  )
}

/**
 * Renders its children only once the donor has consented, and the way to
 * consent otherwise.
 *
 * Brief §5 makes consent the gate rather than a formality. Asking on the page
 * the donor opened — instead of sending them to settings and hoping they come
 * back — is what keeps it a gate somebody walks through rather than around.
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['health', 'me'], queryFn: healthApi.me })
  const consent = useMutation({
    mutationFn: healthApi.consent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
  })

  if (me.isLoading) return <Skeleton className="h-48 w-full" />
  if (me.data?.consented) return <>{children}</>

  return (
    <section className="hairline space-y-3 rounded-sm bg-card p-4">
      <h2 className="font-display text-display-sm">Before you register</h2>
      <ConsentTerms />
      {consent.isError ? (
        <p role="alert" className="text-sm text-destructive">
          That did not go through. Try again.
        </p>
      ) : null}
      <Button disabled={consent.isPending} onClick={() => consent.mutate()}>
        {consent.isPending ? 'Saving…' : 'I agree'}
      </Button>
    </section>
  )
}
