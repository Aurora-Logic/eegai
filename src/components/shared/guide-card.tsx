import { Link } from 'react-router-dom'
import { ArrowRight, Route } from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { flowsFor } from '@/lib/flows'
import { t } from '@/lib/i18n'
import type { Role } from '@/lib/state-machine'

/**
 * The way into the manual, from wherever somebody actually is.
 *
 * The manual was reachable only from a help icon in the header and from a
 * first-run overlay that shows once. Somebody who dismissed the overlay on day
 * one and wants it again on day three had to guess at a question-mark icon.
 *
 * One row rather than a card with a picture in it: this is a signpost, not the
 * thing itself, and a home screen's job is the task the person came to do. It
 * names the first step of their own journey so it reads as "this is about you"
 * rather than as generic help.
 */
export function GuideCard({ className }: { className?: string | undefined }) {
  const { user } = useSession()
  const role: Role = user?.role ?? 'donor'
  const first = flowsFor(role)[0]

  return (
    <Link
      to="/guide"
      className={`hairline group flex min-h-14 items-center gap-3 rounded-sm bg-card p-3 transition-colors hover:bg-foreground/5 ${className ?? ''}`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-primary/15 text-primary">
        <Route className="size-4" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('guide.open')}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {first
            ? `Starts with: ${first.steps[0]?.label.toLowerCase()}`
            : 'The whole journey, drawn'}
        </span>
      </span>

      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  )
}
