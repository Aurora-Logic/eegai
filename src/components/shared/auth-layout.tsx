import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BackLink } from '@/components/shared/back-link'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { t } from '@/lib/i18n'

/**
 * Frame for the two auth pages. The illustration sits above the form on a
 * phone and beside it on a wide screen — on a 360px screen a decorative
 * picture must never push the first field below the fold.
 */
export function AuthLayout({
  title,
  subtitle,
  illustration,
  children,
  footer,
}: {
  title: string
  subtitle: string
  illustration: ReactNode
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <main className="plaster-ground min-h-dvh">
      <div className="mx-auto grid max-w-4xl items-center gap-8 px-6 py-10 md:grid-cols-2 md:gap-12">
        <div className="text-foreground">
          {/* The language picker has to be reachable *before* signing in. It
              lived only in the signed-in header, which put it behind a form
              written in a language the visitor may not read — precisely the
              person it exists for. */}
          <div className="flex items-center gap-3">
            {/* Sign-in, sign-up and the password page are reached from the
                landing page and from each other, so they need a way back just
                as much as the signed-in screens do. They sit outside AppShell,
                which is why they had none. */}
            <BackLink />
            <Link to="/" className="mr-auto flex items-baseline gap-2">
              <span lang="ta" className="font-display text-display-md leading-none">
                {t('app.nameScript')}
              </span>
              <span className="sr-only">{t('app.name')}</span>
            </Link>
            <LanguageSwitcher />
          </div>

          <div className="mt-6 hidden md:block">{illustration}</div>
          <div className="mt-4 md:hidden">{illustration}</div>
        </div>

        <div className="w-full max-w-sm">
          <h1 className="font-display text-display-lg">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          {children}
          <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </main>
  )
}
