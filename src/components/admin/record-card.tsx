import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The admin queues as cards rather than tables.
 *
 * A table is the right shape for scanning one attribute down a column. These
 * queues are not that — every row is a decision about one organisation, one
 * volunteer, one item, and the operator reads the whole row before acting. On a
 * phone the table version put the decision buttons behind a horizontal scroll,
 * which is the worst possible place for the only control that matters.
 *
 * Cards on every viewport rather than cards-below-md and a table above: two
 * layouts for one list means two things to keep in step, and the card grid reads
 * perfectly well at two or three columns on a desktop.
 *
 * A `ul`/`li` because that is what this is, and because it gives the e2e suite a
 * stable `listitem` role that does not change with the viewport — the table
 * version's `row` role disappeared below md, which is a trap.
 */
export function RecordList({
  children,
  columns = 2,
}: {
  children: ReactNode
  /** Widest column count. Dense rows take 3, decision-heavy ones take 2. */
  columns?: 2 | 3
}) {
  return (
    <ul
      className={cn(
        'grid gap-3 md:grid-cols-2',
        columns === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2',
      )}
    >
      {children}
    </ul>
  )
}

export function RecordCard({
  title,
  subtitle,
  badges,
  children,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Status and category chips, kept on the same line as the title block. */
  badges?: ReactNode
  /** The detail rows. Use `Field` for label/value pairs. */
  children?: ReactNode
  /** Buttons. Always last and always full width on a phone. */
  actions?: ReactNode
}) {
  return (
    <li className="hairline flex flex-col gap-3 rounded-sm bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {badges ? <div className="flex shrink-0 flex-wrap gap-1">{badges}</div> : null}
      </div>

      {children ? <dl className="grid gap-1.5 text-sm">{children}</dl> : null}

      {/* mt-auto so cards of different heights in one row keep their actions
          aligned along the bottom edge rather than floating mid-card. */}
      {actions ? (
        <div className="mt-auto flex flex-wrap gap-2 pt-1 [&>*]:min-h-11 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      ) : null}
    </li>
  )
}

/** One label/value pair. The label column is fixed so values line up down a card. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
