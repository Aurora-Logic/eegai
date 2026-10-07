import { Baby, Droplet, MapPin, Package, Scissors, type LucideIcon } from 'lucide-react'
import { GOODS_FLOW, HAIR_FLOW, HEALTH_FLOW, MILK_FLOW, type FlowStep } from '@/lib/flows'
import { t, type StringKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * The wall, as the way in.
 *
 * EEGAI is named for a wall people hang things on, and the product's own
 * animation is a brick lifting off one. So the four things you can give are
 * laid as four bricks in a running bond — unequal widths, mortar gaps, ink
 * hairlines — and the wall is not a picture of the idea, it is the navigation:
 * press a brick and the journey underneath becomes that journey.
 *
 * This replaces four flow diagrams printed one after another, which was the
 * single longest stretch of text on the page and which nobody was going to
 * read four times over.
 */
interface Kind {
  key: 'blood' | 'hair' | 'milk' | 'material'
  icon: LucideIcon
  label: StringKey
  hint: StringKey
  flow: StringKey
  steps: FlowStep[]
  /** Brick width in a twelve-column course. Unequal, the way a bond is. */
  span: string
}

const KINDS: Kind[] = [
  {
    key: 'blood',
    icon: Droplet,
    label: 'landing.typeBlood',
    hint: 'landing.typeBloodBody',
    flow: 'landing.flowBlood',
    steps: HEALTH_FLOW.donor,
    span: 'col-span-7',
  },
  {
    key: 'hair',
    icon: Scissors,
    label: 'landing.typeHair',
    hint: 'landing.typeHairBody',
    flow: 'landing.flowHair',
    steps: HAIR_FLOW,
    span: 'col-span-5',
  },
  {
    key: 'milk',
    icon: Baby,
    label: 'landing.typeMilk',
    hint: 'landing.typeMilkBody',
    flow: 'landing.flowMilk',
    steps: MILK_FLOW,
    span: 'col-span-5',
  },
  {
    key: 'material',
    icon: Package,
    label: 'landing.typeMaterial',
    hint: 'landing.typeMaterialBody',
    flow: 'landing.flowMaterial',
    steps: GOODS_FLOW,
    span: 'col-span-7',
  },
]

export type GivingKind = Kind

export const GIVING_KINDS = KINDS

export function GivingWall({
  chosen,
  onChoose,
  className,
}: {
  chosen: Kind
  onChoose: (kind: Kind) => void
  className?: string
}) {
  return (
    <div className={className}>
      {/* Mortar, not margin: the gap is tight and even, which is most of what
          makes a row of boxes read as a course of bricks. */}
      <div className="grid grid-cols-12 gap-1.5">
        {KINDS.map((kind, index) => {
          const on = kind.key === chosen.key
          return (
            <button
              key={kind.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChoose(kind)}
              className={cn(
                kind.span,
                'hairline group relative overflow-hidden rounded-sm p-3 text-left sm:p-3.5',
                // The moulded top edge of a brick, catching the light.
                'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-background/60',
                'transition-[transform,background-color,border-color] duration-200',
                // The brick lifts off the wall, the same gesture the goods lane
                // uses when an organisation claims one.
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:hover:-translate-y-0.5',
                on
                  ? // The hairline is a box-shadow, so a shadow utility here
                    // silently replaced it and the chosen brick lost its edge.
                    // Recolouring the hairline's own variables keeps one
                    // mechanism and turns that edge marigold.
                    'bg-primary/15 [--hairline-opacity:0.65] [--hairline:var(--marigold)] motion-safe:-translate-y-0.5'
                  : 'bg-card hover:bg-foreground/5',
                // Laid in, one course after another, on arrival only.
                'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards',
              )}
              style={{ animationDelay: `${index * 70}ms`, animationDuration: '500ms' }}
            >
              <kind.icon
                className={cn(
                  'size-5 transition-colors sm:size-6',
                  on ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
                aria-hidden
              />
              <span className="mt-1.5 block font-display text-display-sm leading-none">
                {t(kind.label)}
              </span>
              {/* Clamped: an even course beats a complete sentence here, and
                  the whole sentence is on the donor's own screen anyway. */}
              <span className="mt-1 line-clamp-2 hidden text-sm text-muted-foreground sm:block">
                {t(kind.hint)}
              </span>
            </button>
          )
        })}
      </div>

      {/* The course of mortar the wall stands on. */}
      <div className="mt-2 h-px bg-foreground/15" />
    </div>
  )
}

/**
 * The journey the chosen brick opens.
 *
 * Full width, never in a column beside the wall: the diagram turns horizontal
 * at the `md` breakpoint of the viewport rather than of its container, so half
 * a desktop is exactly where it runs off the side — which it did, until the
 * page sweep caught it.
 */
export function GivingJourney({ chosen, className }: { chosen: Kind; className?: string }) {
  return (
    <section className={className} aria-live="polite">
      <h2 className="font-mono text-xs font-normal uppercase tracking-[0.18em] text-muted-foreground">
        {t('landing.howTitle')}
      </h2>
      <h3 className="mt-2 font-display text-display-md">{t(chosen.flow)}</h3>

      {/* A route rather than a table: the steps wrap like a line of text, so
          four steps and seven both read at any width. The shared FlowDiagram
          gives every step an equal column, which at seven steps and half a
          desktop was four words stacked one per line. */}
      <ol className="mt-4 flex flex-wrap items-stretch gap-x-1.5 gap-y-2">
        {chosen.steps.map((step, index) => (
          <li key={step.label} className="flex items-stretch gap-1.5">
            {index > 0 ? (
              <span aria-hidden className="self-center font-mono text-sm text-muted-foreground">
                →
              </span>
            ) : null}
            <span
              className={cn(
                'hairline flex max-w-[15rem] items-start gap-2 rounded-sm px-3 py-2',
                // The handoff: dashed and unfilled, so the step where the app
                // stops being involved looks like it.
                step.handoff ? 'border-dashed bg-transparent' : 'bg-card',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-xs',
                  step.handoff ? 'text-muted-foreground' : 'bg-primary/15 text-primary',
                )}
                aria-hidden
              >
                {step.handoff ? <MapPin className="size-3" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug">{step.label}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{step.who}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
