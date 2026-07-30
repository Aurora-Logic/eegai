/**
 * Illustrations for the admin queues.
 *
 * Its own module for the same reason `journey.tsx` is: these are only reached
 * from the admin chunk, and importing across would drag one route's drawings
 * into another's bundle.
 *
 * No brick courses here, unlike the rest of the set. An admin panel is not the
 * wall — it is the desk behind it — so the vocabulary is trays and paper.
 *
 * Same drawing rules otherwise: `currentColor` and brand tokens only, round
 * caps, slightly irregular coordinates so it reads as block-print. Decorative,
 * so `aria-hidden`.
 */

type Props = { className?: string | undefined }

/**
 * An empty queue.
 *
 * The distinction this drawing has to carry is that nothing waiting is *good
 * news*. An empty tray on its own is ambiguous — it could equally mean the feed
 * is broken — so the last sheet sits beside it, stamped, and the tray is empty
 * because the work went through rather than because it never arrived.
 */
export function ClearedQueueScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 140"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* ---- the tray, seen slightly from above ---- */}
      <path
        d="M28 82 L164 82 L150 118 q-1.4 4 -5.4 4 L45 122 q-4 0 -5.4 -4 Z"
        fill="hsl(var(--kraft))"
        fillOpacity="0.35"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* The inner rim is what makes it read as a container with nothing in it
          rather than as a flat kraft shape. */}
      <path
        d="M40 91 L152 91"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.35"
        strokeLinecap="round"
      />

      {/* ---- the last one through, stamped and set down ---- */}
      <g transform="rotate(-8 190 84)">
        <rect
          x="166"
          y="50"
          width="48"
          height="64"
          rx="2"
          fill="hsl(var(--background))"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinejoin="round"
        />
        <g stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.3" strokeLinecap="round">
          <path d="M176 62 L204 62" />
          <path d="M176 70 L197 70" />
        </g>
        <path
          d="M177 90 l7 8 l16 -20"
          stroke="hsl(var(--moss))"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <path
        d="M16 126 L224 126"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />
    </svg>
  )
}

/**
 * A filter that matched nothing.
 *
 * Deliberately a different drawing from the empty queue, because it means
 * something different: the records exist, this question just did not find them.
 * The glass is blank while ruled lines run past it on both sides — the answer is
 * elsewhere, not absent.
 */
export function NoMatchesScene({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 140"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* ---- rows of records, running past ---- */}
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.22"
        strokeLinecap="round"
        strokeDasharray="6 8"
      >
        <path d="M22 44 L214 44" />
        <path d="M22 66 L214 66" />
        <path d="M22 88 L212 88" />
      </g>

      {/* ---- the handle, drawn first so the glass sits on top of it ---- */}
      <path
        d="M148 92 L182 124"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />

      {/* ---- the glass, and nothing in it ---- */}
      <circle
        cx="122"
        cy="66"
        r="36"
        fill="hsl(var(--background))"
        stroke="currentColor"
        strokeWidth="2.8"
      />
      <path
        d="M102 46 q8 -9 22 -9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeOpacity="0.35"
        strokeLinecap="round"
      />

      <path
        d="M16 130 L224 130"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeOpacity="0.4"
      />
    </svg>
  )
}
