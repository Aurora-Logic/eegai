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
 * The landing hero: someone's things crossing Coimbatore on an auto.
 *
 * The previous version was three items hanging on hooks. It was on-metaphor and
 * it was a still life — a wall of objects with nobody in it, which is a strange
 * way to open a product that is entirely about people handing things to each
 * other.
 *
 * This is the journey instead, on a loop: a house on the left, a centre with its
 * shutter up on the right, and an auto carrying a bundle between them. The
 * doorway warms as it arrives. An auto rather than a van because that is what
 * actually moves things across this city, and because it has more character than
 * anything else on four wheels.
 *
 * All of the motion is CSS on inline SVG — no video, no request, no bytes beyond
 * the markup, and it inverts with the theme. globals.css zeroes animation
 * duration under prefers-reduced-motion, so it settles into a still scene that
 * still reads correctly: the auto simply sits mid-journey.
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
      <BrickCourses rows={5} width={400} height={150} />

      {/* ---- the donor's house, left ---- */}
      <path
        d="M28 208 L28 128 L74 100 L120 128 L120 208"
        fill="hsl(var(--indigo))"
        fillOpacity="0.06"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M18 132 L74 96 L130 132"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* a water tank on the roof, which every house here has */}
      <rect
        x="92"
        y="86"
        width="18"
        height="14"
        rx="2"
        fill="hsl(var(--kraft))"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M96 86 v-6 M106 86 v-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* door and window */}
      <path
        d="M60 208 L60 164 q14 -10 28 0 L88 208"
        fill="hsl(var(--marigold))"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <rect x="36" y="146" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="2" />

      {/* ---- the receiving centre, right ---- */}
      <path
        d="M266 208 L266 118 L378 118 L378 208"
        fill="hsl(var(--indigo))"
        fillOpacity="0.06"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect
        x="278"
        y="100"
        width="88"
        height="18"
        rx="2"
        fill="hsl(var(--moss))"
        fillOpacity="0.55"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <g stroke="hsl(var(--plaster))" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.85">
        <path d="M290 109 L312 109" />
        <path d="M320 109 L352 109" />
      </g>
      {/* the doorway that warms when the auto arrives */}
      <path
        d="M304 208 L304 150 q18 -12 36 0 L340 208"
        fill="hsl(var(--marigold))"
        className="animate-welcome motion-reduce:animate-none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* ---- ground ---- */}
      <path
        d="M8 208 L392 208"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.2">
        <path d="M150 220 L186 220" />
        <path d="M206 220 L242 220" />
        <path d="M262 220 L298 220" />
      </g>

      {/* ---- the handover, which is the whole product in one gesture ----
          Centred and large, because it is the only thing on this page worth
          looking at. The parcel is the only element that moves: it lifts out of
          the volunteer's hands, arcs across, settles into the child's, and is
          carried in — then the loop starts again with the next one.

          Both faces smile. The volunteer's is the point as much as the child's;
          a drawing where only the receiver is glad makes giving look like a
          transaction. */}
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {/* the volunteer */}
        <circle cx="150" cy="112" r="18" fill="hsl(var(--moss))" fillOpacity="0.45" />
        <path d="M150 130 L150 176" />
        <path d="M150 176 L138 208 M150 176 L163 208" />
        <path d="M150 142 L186 150" />
      </g>
      <g fill="currentColor" fillOpacity="0.8">
        <circle cx="144" cy="108" r="2.1" />
        <circle cx="157" cy="108" r="2.1" />
      </g>
      <path
        d="M143 118 q7 6 14 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />

      {/* the child, arms lifting as it arrives */}
      <g className="origin-[248px_182px] animate-reach motion-reduce:animate-none">
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="248" cy="140" r="15" fill="hsl(var(--kraft))" fillOpacity="0.9" />
          <path d="M248 155 L248 186" />
          <path d="M248 186 L238 208 M248 186 L258 208" />
          <path d="M248 164 L226 152" />
          <path d="M248 164 L268 150" />
        </g>
        <g fill="currentColor" fillOpacity="0.8">
          <circle cx="243" cy="137" r="1.9" />
          <circle cx="253.5" cy="137" r="1.9" />
        </g>
        <path
          d="M242 145 q6 6 12 0"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeOpacity="0.8"
        />
      </g>

      {/* the parcel itself */}
      <g className="animate-pass motion-reduce:animate-none">
        <path
          d="M186 138 q17 -7 34 0 L215 166 q-12 5 -24 0 Z"
          fill="hsl(var(--marigold))"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M203 135 v33" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.45" />
        <path
          d="M188 150 q15 5 30 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.45"
        />
      </g>

      {/* two birds, because an empty sky is a poster and this is a street */}
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.35">
        <path d="M236 56 q6 -5 12 0" />
        <path d="M248 56 q6 -5 12 0" />
        <path d="M282 40 q5 -4 10 0" />
        <path d="M292 40 q5 -4 10 0" />
      </g>
    </svg>
  )
}

/**
 * Sign-in: a lit threshold with a kolam drawn on the ground.
 *
 * The old scene was an empty hook with a shawl over it — accurate to the wall
 * metaphor and completely inert, which is a poor thing to greet a returning
 * person with.
 *
 * A kolam is the right answer here and not decoration. In Tamil Nadu it is
 * drawn at the threshold each morning, before the household opens up, and it
 * means precisely what this screen means: someone is expected, and the door is
 * ready for them. Coimbatore is the pilot city, so the welcome should look like
 * the welcome people actually recognise rather than a generic open door.
 *
 * Drawn the way a kolam is drawn — a dot grid first, then one continuous looping
 * line threaded around the dots — so it reads as the real thing to anyone who
 * has made one, rather than as a flower shape.
 */
export function ReturningScene({ className }: Props) {
  // The pulli — the dot grid a kolam is threaded around. A 3-5-3 diamond, the
  // simplest traditional layout.
  const dots: [number, number][] = []
  for (const [row, count] of [
    [-1, 3],
    [0, 5],
    [1, 3],
  ] as const) {
    for (let i = 0; i < count; i++) {
      dots.push([(i - (count - 1) / 2) * 14, row * 15])
    }
  }

  return (
    <svg
      viewBox="0 0 240 170"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <BrickCourses rows={4} width={240} height={120} />

      {/* ---- the doorway, cut into the wall ---- */}
      <path
        d="M80 122 L80 56 q40 -30 80 0 L160 122"
        fill="hsl(var(--indigo))"
        fillOpacity="0.07"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M72 122 L168 122"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />

      {/* ---- agal vilakku, hung in the doorway ---- */}
      <path d="M120 30 v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* the flame sits above the lip, not on top of the bowl */}
      <path
        d="M120 42 q5 -7 0 -13 q-5 6 0 13 Z"
        fill="hsl(var(--marigold))"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* a shallow bowl with a drawn-out spout, which is what makes it a lamp */}
      <path
        d="M104 46 q16 9 32 0 q-3 11 -16 11 q-13 0 -16 -11 Z"
        fill="hsl(var(--marigold))"
        fillOpacity="0.95"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M104 46 L98 43" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <g stroke="hsl(var(--marigold))" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45">
        <path d="M92 54 L84 51" />
        <path d="M148 54 L156 51" />
        <path d="M95 66 L87 69" />
        <path d="M145 66 L153 69" />
      </g>

      {/* ---- the kolam, on the ground in front of the threshold ----
          Flattened, because it is drawn flat on the floor and we are looking
          across it rather than down at it. */}
      <g transform="translate(120 143) scale(1 0.62)">
        <g fill="currentColor" fillOpacity="0.45">
          {dots.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />
          ))}
        </g>
        {/* One continuous looping line around the dots — four petals, the way a
            beginner's kolam is actually drawn. */}
        <g
          stroke="hsl(var(--vermilion))"
          strokeOpacity="0.8"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {[0, 90, 180, 270].map((angle) => (
            <path
              key={angle}
              d="M0 0 q-13 -10 0 -26 q13 16 0 26 Z"
              transform={`rotate(${angle})`}
            />
          ))}
          <circle cx="0" cy="0" r="6" />
        </g>
      </g>
      {/* the ground the kolam is drawn on */}
      <path
        d="M40 162 L200 162"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeOpacity="0.35"
      />

      {/* a pot beside the door, because a threshold is never quite bare */}
      <path
        d="M182 106 L202 106 L199 122 L185 122 Z"
        fill="hsl(var(--kraft))"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <g stroke="hsl(var(--moss))" strokeWidth="2.2" strokeLinecap="round">
        <path d="M192 106 q-3 -13 -11 -17" />
        <path d="M192 106 q3 -15 11 -19" />
        <path d="M192 106 v-19" />
      </g>
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
