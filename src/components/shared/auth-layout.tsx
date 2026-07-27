import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
          <Link to="/" className="font-display text-display-sm">
            {t('app.name')}
          </Link>
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
