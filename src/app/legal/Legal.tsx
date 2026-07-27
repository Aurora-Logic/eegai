import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

/**
 * Frame for the legal pages.
 *
 * **These are drafts, not advice, and they are not signed off.** They are
 * written to be an honest description of what this software actually does with
 * data — which is the only part I can state accurately — and every fact that
 * belongs to the organisation rather than the code is marked as outstanding
 * rather than invented. PLAN.md §11 Q2 does not yet have an answer for which
 * legal entity operates this, so an operator name, address and registration
 * number cannot be filled in without making them up, and a policy naming a
 * company that does not exist is worse than no policy.
 *
 * Deliberately English-only. Every other string in this product goes through
 * t(), but translating legal text with no lawyer reading the result produces
 * three documents that say subtly different things — and under the DPDP Act the
 * Indian-language versions are the ones a Coimbatore user would rely on. Getting
 * them translated properly is a task for whoever signs these off.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="plaster-ground min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 pt-6">
        <Link to="/" className="flex items-baseline gap-2">
          <span lang="ta" className="font-display text-display-md leading-none">
            {t('app.nameScript')}
          </span>
          <span className="sr-only">{t('app.name')}</span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16 pt-8">
        <h1 className="font-display text-display-lg">{title}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Last updated {updated}</p>

        {/* Shown to readers, not only to developers. Someone relying on this
            document is entitled to know it has not been through a lawyer. */}
        <p className="hairline mt-6 rounded-sm border-primary/40 bg-card p-4 text-sm">
          <strong className="font-medium">This is a working draft.</strong> It has not been reviewed
          by a lawyer, and the operating entity for this service is not yet decided. Anything marked{' '}
          <Outstanding>like this</Outstanding> is still to be confirmed. Do not rely on this
          document until that has happened.
        </p>

        <div className="mt-8 space-y-6 text-pretty leading-relaxed">{children}</div>

        <div className="mt-12 flex flex-wrap gap-3 border-t border-border pt-6">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/">
              <ArrowLeft aria-hidden /> {t('error.goHome')}
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link to="/privacy">{t('legal.privacy')}</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link to="/terms">{t('legal.terms')}</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}

/** A fact that belongs to the operator, not the software. Never guessed at. */
export function Outstanding({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded-sm bg-primary/25 px-1 font-mono text-[0.9em] text-foreground">
      [{children}]
    </mark>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-display-sm">{title}</h2>
      {children}
    </section>
  )
}
