/**
 * The five marks of the post wizard, one per step.
 *
 * Small on purpose — 48px of drawing next to a line of copy, not a scene. The
 * wizard's job is to be filled in; an illustration the size of the ones on the
 * landing page would push the first field below the fold on a phone, which is
 * the opposite of helping.
 *
 * What they are actually for: a wizard is the one place someone can lose track
 * of which of five near-identical form screens they are on. The badges above
 * say it in words; the mark says it at a glance, in the moment between screens
 * where nobody reads.
 *
 * Own module rather than `journey.tsx` — only the donor's post route imports it.
 */

type Props = { className?: string | undefined }

const SVG = {
  viewBox: '0 0 48 48',
  fill: 'none',
  'aria-hidden': true,
  focusable: 'false',
} as const

/** Photos: a second frame behind the first, because we ask for more than one. */
function PhotosMark({ className }: Props) {
  return (
    <svg {...SVG} className={className}>
      <rect
        x="7"
        y="11"
        width="27"
        height="23"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.3"
      />
      <rect
        x="14"
        y="16"
        width="28"
        height="24"
        rx="2"
        fill="hsl(var(--marigold))"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <circle cx="34" cy="24" r="3" fill="hsl(var(--marigold))" />
      <path
        d="M17 36 l7 -8 l5.5 6.5 l3.5 -4 l7 8.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** What it is: a luggage tag — the thing you write on and tie to an object. */
function DetailsMark({ className }: Props) {
  return (
    <svg {...SVG} className={className}>
      <path
        d="M17 13 L38 13 q3 0 3 3 L41 32 q0 3 -3 3 L17 35 L7 24 Z"
        fill="hsl(var(--kraft))"
        fillOpacity="0.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="24" r="2.6" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="2" strokeOpacity="0.45" strokeLinecap="round">
        <path d="M23 20 L35 20" />
        <path d="M23 28 L31 28" />
      </g>
    </svg>
  )
}

/** Condition: the checklist, with the answers already going in. */
function ConditionMark({ className }: Props) {
  return (
    <svg {...SVG} className={className}>
      <rect
        x="11"
        y="10"
        width="26"
        height="31"
        rx="2.5"
        fill="hsl(var(--background))"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M19 7 L29 7 q1.5 0 1.5 1.5 L30.5 13 L17.5 13 L17.5 8.5 Q17.5 7 19 7 Z"
        fill="hsl(var(--kraft))"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <g stroke="hsl(var(--moss))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 22 l3 3 l6.5 -7" />
        <path d="M16 32 l3 3 l6.5 -7" strokeOpacity="0.45" />
      </g>
      <g stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.3" strokeLinecap="round">
        <path d="M28 23 L33 23" />
        <path d="M28 33 L33 33" />
      </g>
    </svg>
  )
}

/** Pickup: a doorway with a pin over it — where a volunteer knocks. */
function PickupMark({ className }: Props) {
  return (
    <svg {...SVG} className={className}>
      <path
        d="M12 41 L12 25 q0 -10 10 -10 t10 10 L32 41"
        fill="hsl(var(--kraft))"
        fillOpacity="0.35"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="31" r="1.8" fill="currentColor" fillOpacity="0.6" />
      <path
        d="M38 8 q6.5 0 6.5 6.5 q0 5 -6.5 11.5 q-6.5 -6.5 -6.5 -11.5 Q31.5 8 38 8 Z"
        fill="hsl(var(--marigold))"
        fillOpacity="0.9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="38" cy="14.5" r="2.4" fill="hsl(var(--background))" />
      <path
        d="M6 41 L42 41"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
    </svg>
  )
}

/**
 * Review: the brick, and the gap in the wall it is about to fill.
 *
 * The only mark that shows a next step rather than the current one, because
 * that is what this screen is — the last look before it goes up.
 */
function ReviewMark({ className }: Props) {
  return (
    <svg {...SVG} className={className}>
      {/* The course above, with a slot left open in it. Drawn at half opacity
          rather than a quarter: at 44px the first version read as a scribble,
          and the whole point is that the gap is recognisably brick-shaped. */}
      <g
        stroke="currentColor"
        strokeWidth="2.2"
        strokeOpacity="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 7 L43 7" />
        <path d="M5 7 L5 21" />
        <path d="M43 7 L43 21" />
        <path d="M5 21 L16 21" />
        <path d="M32 21 L43 21" />
        <path d="M16 7 L16 21" />
        <path d="M32 7 L32 21" />
      </g>
      <rect
        x="16"
        y="7"
        width="16"
        height="14"
        fill="hsl(var(--marigold))"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.4"
        strokeDasharray="4 4"
      />

      {/* and the one in hand, on its way up to fill it */}
      <rect
        x="15"
        y="30"
        width="18"
        height="13"
        rx="1.5"
        fill="hsl(var(--marigold))"
        fillOpacity="0.85"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <g stroke="currentColor" strokeWidth="2" strokeOpacity="0.35" strokeLinecap="round">
        <path d="M10 42 L10 31" />
        <path d="M38 42 L38 31" />
      </g>
    </svg>
  )
}

const MARKS = [PhotosMark, DetailsMark, ConditionMark, PickupMark, ReviewMark] as const

/** Renders the mark for a step index; anything out of range draws nothing. */
export function StepMark({ step, className }: { step: number; className?: string | undefined }) {
  const Mark = MARKS[step]
  return Mark ? <Mark className={className} /> : null
}
