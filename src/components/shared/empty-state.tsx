import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A panel with nothing in it.
 *
 * Replaces three copies of a centred grey sentence in a box. The sentence was
 * accurate and said nothing: "Nothing waiting here" reads the same whether the
 * queue is clear or the request failed, and a person who has just arrived at an
 * admin screen cannot tell which.
 *
 * So the shape is drawing, then a line in the page's own voice, then an
 * optional second line saying what to do instead. The illustration is passed in
 * rather than chosen here, because the module it comes from decides which chunk
 * it lands in (see `illustrations/admin.tsx`).
 */
export function EmptyState({
  illustration,
  title,
  hint,
  action,
  className,
}: {
  illustration?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'hairline flex flex-col items-center rounded-sm bg-card px-4 py-8 text-center sm:py-10',
        className,
      )}
    >
      {illustration ? (
        // Capped by width on a phone and by height above it: the scenes are
        // wider than they are tall, so a width cap alone let them eat a third
        // of a laptop panel.
        <div className="mb-5 w-full max-w-[240px] text-foreground/70">{illustration}</div>
      ) : null}
      <p className="font-display text-display-sm">{title}</p>
      {hint ? <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
