import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

export default function Landing() {
  return (
    <main className="plaster-ground flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="max-w-[14ch] text-balance font-display text-display-lg sm:text-display-xl">
        {t('app.name')}
      </h1>
      <p className="mt-4 max-w-[38ch] text-muted-foreground">{t('app.tagline')}</p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button disabled>{t('action.post')}</Button>
        <Button variant="outline" asChild>
          <Link to="/style-guide">{t('styleguide.title')}</Link>
        </Button>
      </div>

      <p className="mt-10 font-mono text-xs text-muted-foreground">
        M0 — foundation. Sign-in lands in M1.
      </p>
    </main>
  )
}
