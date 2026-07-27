/**
 * Hand-drawn illustrations, authored as inline SVG.
 *
 * Inline rather than files or an icon pack for three reasons: the PWA precaches
 * an offline shell and must not depend on a network fetch, PLAN.md §8 sets a
 * hard JS/asset budget, and §10 forbids adding an icon set beyond lucide.
 *
 * Everything is drawn in `currentColor` or the brand tokens, so the whole set
 * inverts with the plaster/indigo theme without a second copy. Strokes use
 * round caps and slightly irregular coordinates to read as block-print ink
 * rather than as vector clip-art.
 *
 * All of these are decorative: the surrounding copy already says what the page
 * is, so they carry aria-hidden and add nothing to the accessibility tree.
 */

type Props = { className?: string | undefined }

/** Faint running-bond courses. Shared ground for every scene. */
function BrickCourses({ rows = 6, width = 400, height = 260 }) {
  const courseHeight = height / rows
  const lines = []

  for (let r = 1; r < rows; r++) {
    const y = r * courseHeight
    lines.push(<line key={`h${r}`} x1="0" y1={y} x2={width} y2={y} />)
  }

  for (let r = 0; r < rows; r++) {
    const y = r * courseHeight
    // Alternate courses are offset by half a brick — the bond that makes it
    // read as a wall rather than a grid.
    const offset = r % 2 === 0 ? 0 : width / 8
    for (let x = offset; x < width; x += width / 4) {
      if (x <= 0) continue
      lines.push(<line key={`v${r}-${x}`} x1={x} y1={y} x2={x} y2={y + courseHeight} />)
    }
  }

  return (
    <g stroke="currentColor" strokeOpacity="0.14" strokeWidth="1.2" strokeLinecap="round">
      {lines}
    </g>
  )
}

/**
 * The landing hero: three things hanging on the wall, waiting to be taken.
 * One per category — clothes, books, toys — which is the whole product in a
 * picture.
 */
export function WallScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 400 260"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <BrickCourses />

      {/* The rail the hooks sit on */}
      <line
        x1="24"
        y1="58"
        x2="376"
        y2="58"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />

      {/* ---- Hook 1: a kurta on a hanger ---- */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M92 58 v10" strokeOpacity="0.6" />
        <path d="M92 68 q0 -7 6 -7 t6 7" strokeOpacity="0.6" />
        <path d="M74 92 L92 74 L110 92" strokeOpacity="0.6" />
      </g>
      <path
        d="M74 92 L58 106 L66 118 L74 112 L74 176 q0 5 5 5 L105 181 q5 0 5 -5 L110 112 L118 118 L126 106 L110 92 q-18 11 -36 0 Z"
        fill="hsl(var(--marigold))"
        fillOpacity="0.85"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* placket + a couple of buttons */}
      <path d="M92 100 v78" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.5" />
      <circle cx="92" cy="120" r="2" fill="currentColor" fillOpacity="0.5" />
      <circle cx="92" cy="146" r="2" fill="currentColor" fillOpacity="0.5" />

      {/* ---- Hook 2: a tote of books ---- */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M200 58 v10" strokeOpacity="0.6" />
        <path d="M200 68 q0 -7 6 -7 t6 7" strokeOpacity="0.6" />
      </g>
      <path
        d="M182 96 q0 -22 18 -22 t18 22"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M170 96 L230 96 L224 172 q-0.6 6 -6.6 6 L182.6 178 q-6 0 -6.6 -6 Z"
        fill="hsl(var(--kraft))"
        fillOpacity="0.9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* book spines peeking out */}
      <rect
        x="186"
        y="82"
        width="12"
        height="20"
        rx="1.5"
        fill="hsl(var(--moss))"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="200"
        y="76"
        width="12"
        height="26"
        rx="1.5"
        fill="hsl(var(--vermilion))"
        fillOpacity="0.9"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      {/* ---- Hook 3: a small bear ---- */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M308 58 v10" strokeOpacity="0.6" />
        <path d="M308 68 q0 -7 6 -7 t6 7" strokeOpacity="0.6" />
        <path d="M308 78 v14" strokeOpacity="0.6" />
      </g>
      <g fill="hsl(var(--moss))" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
        <circle cx="293" cy="96" r="7.5" />
        <circle cx="323" cy="96" r="7.5" />
        <circle cx="308" cy="112" r="20" />
        <path d="M288 134 q20 12 40 0 L332 168 q0 8 -8 8 L292 176 q-8 0 -8 -8 Z" />
        <path d="M286 140 L272 158" strokeLinecap="round" />
        <path d="M330 140 L344 158" strokeLinecap="round" />
      </g>
      <circle cx="302" cy="110" r="2.2" fill="hsl(var(--plaster))" />
      <circle cx="314" cy="110" r="2.2" fill="hsl(var(--plaster))" />
      <path
        d="M303 119 q5 4 10 0"
        stroke="hsl(var(--plaster))"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* ---- Ground ---- */}
      <path
        d="M16 214 L384 214"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <g fill="currentColor" fillOpacity="0.09">
        <ellipse cx="92" cy="220" rx="30" ry="4" />
        <ellipse cx="200" cy="220" rx="28" ry="4" />
        <ellipse cx="308" cy="220" rx="30" ry="4" />
      </g>
    </svg>
  )
}

/**
 * Sign-in: a hand returning to a familiar hook. Deliberately quieter than the
 * landing scene — this page is a door, not a pitch.
 */
export function ReturningScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 160"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <BrickCourses rows={4} width={240} height={160} />

      <line
        x1="20"
        y1="40"
        x2="220"
        y2="40"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />

      {/* an empty hook, waiting */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.6">
        <path d="M78 40 v12" />
        <path d="M78 52 q0 -8 7 -8 t7 8" />
      </g>

      {/* and one with a shawl folded over it */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.6">
        <path d="M158 40 v12" />
        <path d="M158 52 q0 -8 7 -8 t7 8" />
      </g>
      <path
        d="M140 62 q25 -12 50 0 L184 118 q-19 8 -38 0 Z"
        fill="hsl(var(--marigold))"
        fillOpacity="0.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M146 78 q19 7 38 0 M147 94 q18 7 36 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />

      <path
        d="M16 136 L224 136"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
    </svg>
  )
}

/**
 * Sign-up: two hands, one giving and one receiving, over a brick. The whole
 * transaction the product exists for.
 */
export function GivingScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 160"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <BrickCourses rows={4} width={240} height={160} />

      {/* the brick being passed */}
      <rect
        x="88"
        y="62"
        width="64"
        height="34"
        rx="3"
        fill="hsl(var(--marigold))"
        fillOpacity="0.9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M88 79 L152 79"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.35"
        strokeLinecap="round"
      />

      {/* left hand, giving */}
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M34 108 q10 -14 26 -12 L86 98 q6 1 6 7 t-6 7 L64 114"
          fill="hsl(var(--kraft))"
          fillOpacity="0.55"
        />
        <path d="M34 108 L18 122" />
        <path d="M46 100 q8 -8 18 -6" strokeOpacity="0.45" />
      </g>

      {/* right hand, receiving */}
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M206 108 q-10 -14 -26 -12 L154 98 q-6 1 -6 7 t6 7 L176 114"
          fill="hsl(var(--kraft))"
          fillOpacity="0.55"
        />
        <path d="M206 108 L222 122" />
        <path d="M194 100 q-8 -8 -18 -6" strokeOpacity="0.45" />
      </g>

      <path
        d="M16 138 L224 138"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
    </svg>
  )
}
