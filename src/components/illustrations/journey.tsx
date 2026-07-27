/**
 * Illustrations for the M6 loop and the handover.
 *
 * A separate module from `illustrations/index.tsx` on purpose. That file is
 * imported by the landing and auth screens, which are in the eager bundle; these
 * are only ever reached from lazy routes. Importing across the two would drag the
 * whole landing scene into the donor chunk and undo the split.
 *
 * Same drawing rules as the rest of the set: `currentColor` and brand tokens
 * only, round caps, slightly irregular coordinates so it reads as block-print
 * rather than clip-art. All decorative, so all `aria-hidden`.
 */

type Props = { className?: string | undefined }

/** Faint running-bond courses — the ground every scene sits on. */
function Courses({ rows = 5, width = 400, height = 220 }) {
  const courseHeight = height / rows
  const lines = []

  for (let r = 1; r < rows; r++) {
    const y = r * courseHeight
    lines.push(<line key={`h${r}`} x1="0" y1={y} x2={width} y2={y} />)
  }
  for (let r = 0; r < rows; r++) {
    const y = r * courseHeight
    const offset = r % 2 === 0 ? 0 : width / 8
    for (let x = offset; x < width; x += width / 4) {
      if (x <= 0) continue
      lines.push(<line key={`v${r}-${x}`} x1={x} y1={y} x2={x} y2={y + courseHeight} />)
    }
  }

  return (
    <g stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.2" strokeLinecap="round">
      {lines}
    </g>
  )
}

/**
 * The acknowledgement moment: an opened carton with the things coming back out
 * of it, and two small figures either side.
 *
 * Drawn as *unpacking* rather than delivery — the donor already knows it was
 * collected. What they have not seen is it being used at the other end, and that
 * is the whole reason this screen exists.
 *
 * Only shown when the NGO sent no photo. A real photo always beats a drawing
 * here, so this is the fallback, not the default.
 */
export function ArrivedScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 400 220"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <Courses />

      {/* ---- the carton ---- */}
      <path
        d="M132 118 L268 118 L258 196 q-0.6 6 -6.6 6 L148.6 202 q-6 0 -6.6 -6 Z"
        fill="hsl(var(--kraft))"
        fillOpacity="0.9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* open flaps, folded outward */}
      <path
        d="M132 118 L108 100 L136 92 L160 110 Z"
        fill="hsl(var(--kraft))"
        fillOpacity="0.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M268 118 L292 100 L264 92 L240 110 Z"
        fill="hsl(var(--kraft))"
        fillOpacity="0.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M150 140 L250 140"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.3"
        strokeLinecap="round"
      />

      {/* ---- what is coming out of it ---- */}
      {/* a folded kurta */}
      <path
        d="M168 108 q-14 -34 6 -46 q14 10 28 0 q20 12 6 46 Z"
        fill="hsl(var(--marigold))"
        fillOpacity="0.9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M188 64 v42" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.45" />

      {/* a book, standing open */}
      <path
        d="M222 106 L222 74 q12 -8 24 -2 L246 106 Z"
        fill="hsl(var(--moss))"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M246 106 L246 72 q12 -6 22 2 L268 106 Z"
        fill="hsl(var(--vermilion))"
        fillOpacity="0.85"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* ---- two small figures, receiving ---- */}
      <g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="72" cy="132" r="12" fill="hsl(var(--moss))" fillOpacity="0.5" />
        <path d="M72 144 L72 178" />
        <path d="M72 152 L96 138" />
        <path d="M72 178 L62 200 M72 178 L84 200" />

        <circle cx="330" cy="140" r="10" fill="hsl(var(--moss))" fillOpacity="0.5" />
        <path d="M330 150 L330 180" />
        <path d="M330 158 L308 146" />
        <path d="M330 180 L322 200 M330 180 L340 200" />
      </g>

      {/* ---- ground ---- */}
      <path
        d="M20 202 L380 202"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <ellipse cx="200" cy="208" rx="70" ry="5" fill="currentColor" fillOpacity="0.08" />
    </svg>
  )
}

/**
 * The handover: one hand saying a number, the other listening.
 *
 * Sits above the codes card. The drawing carries the rule the copy also states —
 * the code is spoken, never typed into someone else's phone — because the
 * picture is what gets looked at and the paragraph is what gets skipped.
 */
export function HandoverScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 320 120"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* the speaker */}
      <g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="56" cy="44" r="14" fill="hsl(var(--marigold))" fillOpacity="0.55" />
        <path d="M56 58 L56 92" />
        <path d="M56 68 L82 60" />
        <path d="M56 92 L46 112 M56 92 L68 112" />
      </g>

      {/* speech, as three arcs rather than a bubble */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55">
        <path d="M96 44 q10 8 0 16" />
        <path d="M110 36 q18 16 0 32" />
        <path d="M124 28 q26 24 0 48" />
      </g>

      {/* the listener, hand cupped to ear */}
      <g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="256" cy="44" r="14" fill="hsl(var(--moss))" fillOpacity="0.5" />
        <path d="M256 58 L256 92" />
        <path d="M256 68 L232 60" />
        <path d="M256 92 L246 112 M256 92 L268 112" />
        <path d="M240 38 q-8 4 -6 12" strokeOpacity="0.6" />
      </g>

      <path
        d="M12 114 L308 114"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />
    </svg>
  )
}
