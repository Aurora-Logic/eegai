import { Link } from 'react-router-dom'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * The top of a home screen: the motto, then the ways in.
 *
 * The home screens had grown into a heading and a row of outline buttons —
 * every capability the same weight, and nothing saying what the product is for.
 * Somebody arriving for the second time could not tell which lane they were in
 * or that the other one existed.
 *
 * The motto carries the Tamil wordmark because brief §8 asks for
 * "EEGAI (ஈகை)" throughout, and this is the one place on a signed-in screen
 * where the name has room to be itself rather than a 20px logotype.
 *
 * The tiles are ways in, not statistics. A count on a home screen is a thing
 * people learn to stop reading; a sentence about what happens next is not.
 */
export interface HomeTile {
  icon: LucideIcon
  label: string
  hint: string
  to: string
  /** The one the person came for. Gets the brand colour; the rest are quiet. */
  primary?: boolean
  /** A small number in the corner — only where it changes what somebody does. */
  count?: number | undefined
}

export function HomeHero({ tiles, className }: { tiles: HomeTile[]; className?: string }) {
  return (
    <section className={className}>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span lang="ta" className="font-display text-display-md leading-none">
          {t('app.nameScript')}
        </span>
        <span className="text-pretty text-muted-foreground">{t('app.tagline')}</span>
        <span className="sr-only">{t('app.name')}</span>
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className={cn(
              'hairline group relative flex min-h-16 items-center gap-3 rounded-sm p-3 transition-colors',
              tile.primary
                ? 'border-primary/40 bg-primary/10 hover:bg-primary/15'
                : 'bg-card hover:bg-foreground/5',
            )}
          >
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-sm',
                tile.primary
                  ? 'bg-primary/20 text-primary'
                  : 'bg-foreground/5 text-muted-foreground',
              )}
            >
              <tile.icon className="size-5" aria-hidden />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block font-medium">{tile.label}</span>
              <span className="block text-xs text-muted-foreground">{tile.hint}</span>
            </span>

            {tile.count ? (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
                {tile.count > 9 ? '9+' : tile.count}
              </span>
            ) : (
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
