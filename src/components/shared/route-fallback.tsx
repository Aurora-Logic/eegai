/**
 * What fills the frame while a route chunk downloads.
 *
 * Deliberately not a spinner. On the target device — a Moto G on patchy 4G — a
 * chunk can take a second or two, and a spinner in that window reads as "broken"
 * where a page-shaped placeholder reads as "loading". It mirrors the AppShell
 * header and heading so the real screen lands in the same place rather than
 * shifting everything down.
 *
 * `animate-pulse` is a Tailwind utility, and globals.css zeroes animation
 * duration under prefers-reduced-motion, so this settles to a static block for
 * anyone who asked for that.
 */
export function RouteFallback() {
  return (
    <div className="plaster-ground min-h-dvh" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading.</span>

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <span className="font-display text-display-sm">EEGAI</span>
          <div className="flex gap-1">
            <span className="size-9 rounded-sm bg-muted" />
            <span className="size-9 rounded-sm bg-muted" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl animate-pulse px-4 py-6">
        <div className="mb-6 space-y-2">
          <div className="h-8 w-48 rounded-sm bg-muted" />
          <div className="h-4 w-64 max-w-full rounded-sm bg-muted" />
        </div>

        {/* Two columns of brick-shaped blanks, matching the wall's masonry. */}
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {[36, 52, 44, 60, 40, 48].map((height, index) => (
            <div
              key={index}
              className="mb-4 break-inside-avoid rounded-sm bg-muted"
              style={{ height: `${height * 4}px` }}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
