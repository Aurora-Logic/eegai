import type { ReactNode } from 'react'

/**
 * The masonry wall.
 *
 * CSS multi-column rather than a JS masonry library: it needs no measurement
 * pass, no resize observer, and no dependency, and it reflows natively when a
 * brick lifts off. The one thing it gives up is strict left-to-right ordering
 * across columns, which does not matter for a wall of unrelated items.
 */
export function Wall({ children }: { children: ReactNode }) {
  return <div className="columns-2 gap-4 md:columns-3 [&>*]:break-inside-avoid">{children}</div>
}

export function WallEmpty({ message }: { message: string }) {
  return (
    <div className="hairline rounded-sm bg-card px-6 py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
    </div>
  )
}
