import { Link } from 'react-router-dom'
import { AppShell } from '@/components/shared/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/use-session'
import { t } from '@/lib/i18n'
import { GUIDE } from '@/lib/guide'
import type { Role } from '@/lib/state-machine'

/**
 * The manual.
 *
 * One source of truth: the first-run tour renders the same STEPS, so the thing
 * someone is shown on day one is the thing they can come back and re-read. Two
 * copies of an explanation drift, and the one nobody looks at is the one that
 * goes stale.
 *
 * Written per role, because the answer to "how does this work" is genuinely
 * different for the four of them and a single combined page would be mostly
 * irrelevant to whoever is reading it.
 */
export default function Guide() {
  const { user } = useSession()
  const role: Role = user?.role ?? 'donor'
  const steps = GUIDE[role]

  return (
    <AppShell
      title={t('guide.title')}
      subtitle={`For ${role === 'ngo' ? 'organisations' : `${role}s`}.`}
    >
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="hairline flex gap-4 rounded-sm bg-card p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <step.icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-medium">
                <Badge variant="muted" className="mr-2 align-middle">
                  {index + 1}
                </Badge>
                {step.title}
              </p>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>
          <strong className="font-medium text-foreground">
            Handover codes are spoken, never sent.
          </strong>{' '}
          Nobody can read a code meant for someone else, and a volunteer never sees one at all.
        </p>
        <p>
          <strong className="font-medium text-foreground">No money changes hands.</strong> There is
          no payment in this product, and nothing is sold.
        </p>
        <p>
          Forgotten your password? There is no automatic reset yet — ask on the{' '}
          <Link to="/forgot-password" className="underline underline-offset-4">
            reset page
          </Link>{' '}
          and someone will call you.
        </p>
      </div>

      <Button asChild className="mt-6 min-h-11">
        <Link to="/">{t('error.goHome')}</Link>
      </Button>
    </AppShell>
  )
}
