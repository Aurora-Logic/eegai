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

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button asChild size="lg">
          <Link to="/sign-up">{t('auth.createAccount')}</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/sign-in">{t('auth.signIn')}</Link>
        </Button>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link to="/style-guide" className="underline underline-offset-4">
          {t('styleguide.title')}
        </Link>
      </p>
    </main>
  )
}
