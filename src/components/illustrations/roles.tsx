/**
 * One scene per role, for the sign-up form.
 *
 * The role radio is the only real decision on that page, and it changes what the
 * whole account will be — but a radio group is a small, low-contrast control and
 * the consequence of picking wrong is invisible until much later. Swapping the
 * illustration makes the choice legible at a glance: you can see whether you are
 * about to become the person who gives, the organisation that receives, or the
 * one who carries it between them.
 *
 * A separate module from `illustrations/index.tsx` so these travel with the lazy
 * SignUp chunk rather than the eager landing bundle.
 *
 * Same drawing rules as the rest of the set: `currentColor` and brand tokens
 * only, round caps, slightly irregular coordinates so it reads as block-print.
 * All decorative — the radio label is what actually names the choice.
 */
import type { Role } from '@/lib/state-machine'

type Props = { className?: string | undefined }

/** Faint running-bond courses, the ground every scene in this product sits on. */
function Courses({ rows = 4, width = 240, height = 110 }) {
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

function Ground() {
  return (
    <path
      d="M20 150 L220 150"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeOpacity="0.45"
    />
  )
}

/**
 * Donor — someone reaching up to hang a bundle on the wall.
 *
 * The moment of giving is the act of *placing*, not of handing over, so the
 * figure is mid-reach with the bundle not yet let go.
 */
export function DonorScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 160"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <Courses />

      <line
        x1="26"
        y1="40"
        x2="214"
        y2="40"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />

      {/* a bundle already up there, so the wall is not empty */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.6">
        <path d="M68 40 v10" />
        <path d="M68 50 q0 -8 7 -8 t7 8" />
      </g>
      <path
        d="M54 62 q21 -10 42 0 L90 106 q-15 6 -30 0 Z"
        fill="hsl(var(--kraft))"
        fillOpacity="0.85"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* the empty hook being filled */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.6">
        <path d="M150 40 v10" />
        <path d="M150 50 q0 -8 7 -8 t7 8" />
      </g>

      {/* the bundle in hand, tilted — it is still being lifted */}
      <g transform="rotate(-8 150 76)">
        <path
          d="M134 60 q22 -10 44 0 L172 100 q-16 6 -32 0 Z"
          fill="hsl(var(--marigold))"
          fillOpacity="0.9"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M140 74 q16 6 32 0" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
      </g>

      {/* the giver, mid-reach */}
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="186" cy="86" r="12" fill="hsl(var(--moss))" fillOpacity="0.5" />
        <path d="M186 98 v32" />
        <path d="M186 106 L166 88" />
        <path d="M186 130 L176 150 M186 130 L198 150" />
      </g>

      <Ground />
      <ellipse cx="120" cy="155" rx="64" ry="4" fill="currentColor" fillOpacity="0.07" />
    </svg>
  )
}

/**
 * NGO — a centre with its shutter up and parcels arriving.
 *
 * Drawn as a place rather than a person: an organisation is a door that stays
 * open, and what a donor wants to know about one is that it is real and it is
 * receiving.
 */
export function NgoScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 160"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <Courses />

      {/* the building front */}
      <path
        d="M52 150 L52 54 L188 54 L188 150"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
        fill="hsl(var(--indigo))"
        fillOpacity="0.05"
      />
      {/* signboard, deliberately blank — this is any organisation, not one */}
      <rect
        x="66"
        y="36"
        width="108"
        height="20"
        rx="2"
        fill="hsl(var(--moss))"
        fillOpacity="0.55"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <g stroke="hsl(var(--plaster))" strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.85">
        <path d="M80 46 L104 46" />
        <path d="M112 46 L150 46" />
      </g>

      {/* the doorway, open */}
      <path
        d="M100 150 L100 92 q20 -14 40 0 L140 150"
        fill="hsl(var(--marigold))"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* shutter, rolled up above the door */}
      <g stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.45">
        <path d="M98 84 L142 84" />
        <path d="M98 79 L142 79" />
        <path d="M98 74 L142 74" />
      </g>

      {/* parcels stacked at the threshold */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
        <rect x="58" y="118" width="34" height="32" fill="hsl(var(--kraft))" fillOpacity="0.9" />
        <path d="M75 118 v32" strokeWidth="1.4" strokeOpacity="0.4" />
        <rect x="64" y="96" width="24" height="22" fill="hsl(var(--kraft))" fillOpacity="0.7" />
        <rect x="150" y="126" width="30" height="24" fill="hsl(var(--kraft))" fillOpacity="0.8" />
      </g>

      <Ground />
    </svg>
  )
}

/**
 * Volunteer — a scooter with a box strapped on the back, already moving.
 *
 * The one role defined by motion rather than by a place, so it is the only
 * scene with speed lines. A scooter specifically: it is what collections in
 * Coimbatore actually happen on.
 */
export function VolunteerScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 160"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <Courses />

      {/* speed lines, behind everything */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.3">
        <path d="M18 84 L52 84" />
        <path d="M10 100 L44 100" />
        <path d="M22 116 L50 116" />
      </g>

      {/* wheels */}
      <g stroke="currentColor" strokeWidth="2.6">
        <circle cx="86" cy="130" r="17" fill="hsl(var(--indigo))" fillOpacity="0.08" />
        <circle cx="182" cy="130" r="17" fill="hsl(var(--indigo))" fillOpacity="0.08" />
        <circle cx="86" cy="130" r="4" fill="currentColor" fillOpacity="0.5" />
        <circle cx="182" cy="130" r="4" fill="currentColor" fillOpacity="0.5" />
      </g>

      {/* body and footboard */}
      <path
        d="M86 130 L104 130 q6 -20 24 -22 L152 108 q10 0 12 -10 L172 82"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M104 128 q10 -16 26 -18 L152 110 q-4 12 -16 14 Z"
        fill="hsl(var(--marigold))"
        fillOpacity="0.85"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* handlebar */}
      <path d="M164 80 L184 76" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />

      {/* the box, strapped on the back */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
        <rect
          x="66"
          y="82"
          width="42"
          height="34"
          rx="2"
          fill="hsl(var(--kraft))"
          fillOpacity="0.9"
        />
        <path d="M87 82 v34" strokeWidth="1.4" strokeOpacity="0.4" />
        <path d="M66 96 L108 96" strokeWidth="1.4" strokeOpacity="0.4" />
      </g>

      {/* the rider: torso down to the seat, an arm out to the bar, a leg
          forward onto the footboard — without the leg it reads as a head
          floating above a scooter. */}
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="141" cy="60" r="11" fill="hsl(var(--moss))" fillOpacity="0.5" />
        <path d="M141 71 L133 106" />
        <path d="M139 80 L165 79" />
        <path d="M133 106 L120 124" />
      </g>

      <Ground />
      <ellipse cx="134" cy="152" rx="70" ry="4" fill="currentColor" fillOpacity="0.07" />
    </svg>
  )
}

/** The scene for whichever role is currently selected. */
export function RoleScene({ role, className }: { role: Role } & Props) {
  if (role === 'ngo') return <NgoScene className={className} />
  if (role === 'volunteer') return <VolunteerScene className={className} />
  return <DonorScene className={className} />
}
