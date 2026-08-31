import { ArrowDown, ArrowRight, MapPin } from 'lucide-react'
import type { FlowStep } from '@/lib/flows'
import { cn } from '@/lib/utils'

/**
 * A journey, drawn.
 *
 * Vertical on a phone and horizontal from `md` up, because a six-step
 * horizontal flow at 360px is either six unreadable columns or a sideways
 * scroll, and both are worse than a list. The arrows turn with it — a
 * downward arrow in a horizontal row points nowhere.
 *
 * The last step of a health journey is drawn differently on purpose. Brief §6
 * puts the donation itself with the institution, so the diagram has to show
 * the app letting go rather than implying it carries on to the end.
 *
 * The whole thing is `aria-hidden` and paired with an ordered list for screen
 * readers: arrows between boxes are a visual grammar, and reading "arrow right"
 * five times is not how anybody wants this explained.
 */
export function FlowDiagram({ title, steps }: { title: string; steps: FlowStep[] }) {
  return (
    <section>
      <h3 className="font-display text-display-sm">{title}</h3>

      <div
        aria-hidden
        className="mt-3 flex flex-col items-stretch gap-0 md:flex-row md:items-stretch"
      >
        {steps.map((step, index) => (
          <div key={step.label} className="flex flex-col md:flex-1 md:flex-row md:items-stretch">
            <div
              className={cn(
                'hairline flex-1 rounded-sm bg-card p-3',
                // The handoff: dashed, and the brand colour drops away, so the
                // step where the app stops being involved looks like it.
                step.handoff && 'border-dashed bg-transparent',
              )}
            >
              <p className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-xs',
                    step.handoff ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
                  )}
                >
                  {step.handoff ? <MapPin className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{step.label}</span>
                  <span className="block text-xs text-muted-foreground">{step.who}</span>
                </span>
              </p>
            </div>

            {index < steps.length - 1 ? (
              <span className="flex shrink-0 items-center justify-center py-1 text-muted-foreground md:px-1.5 md:py-0">
                <ArrowDown className="size-4 md:hidden" />
                <ArrowRight className="hidden size-4 md:block" />
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {/* The same journey, in the order it happens, for anyone who cannot see
          the boxes. */}
      <ol className="sr-only">
        {steps.map((step) => (
          <li key={step.label}>
            {step.label} — {step.who}
          </li>
        ))}
      </ol>
    </section>
  )
}
