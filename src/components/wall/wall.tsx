import type { ReactNode } from 'react'
import { EmptyWallScene } from '@/components/illustrations/journey'

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

/**
 * The empty wall.
 *
 * The drawing is doing real work here rather than decorating: an empty state is
 * the one screen with nothing else on it, so it is where a picture has the most
 * room and the least competition. It shows a bare hook with the dashed ghost of
 * a garment, which says "this is where yours goes" — the same thing the copy
 * says, in the register people actually look at first.
 *
 * `action` is where the invitation goes. An empty state that only describes the
 * emptiness makes the reader find their own way out of it.
 */
export function WallEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="hairline rounded-sm bg-card px-6 py-10 text-center">
      <EmptyWallScene className="mx-auto w-full max-w-[240px] text-foreground" />
      <p className="mt-2 text-pretty text-muted-foreground">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
