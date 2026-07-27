import { Link } from 'react-router-dom'
import { CheckCheck, KeyRound, ShieldCheck } from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { Button } from '@/components/ui/button'
import { WallScene } from '@/components/illustrations'
import { t } from '@/lib/i18n'
import type { StringKey } from '@/lib/i18n'

const STEPS = [
  { n: '1', title: 'Photograph it', body: 'One minute, up to five photos, from your phone.' },
  { n: '2', title: 'An organisation claims it', body: 'Verified, nearby, first claim wins.' },
  { n: '3', title: 'It gets collected', body: 'A vetted volunteer at your door, or a courier.' },
]

/** Who the product is for, in the order people arrive. */
const AUDIENCES: { title: StringKey; body: StringKey }[] = [
  { title: 'landing.forDonor', body: 'landing.forDonorBody' },
  { title: 'landing.forNgo', body: 'landing.forNgoBody' },
  { title: 'landing.forVolunteer', body: 'landing.forVolunteerBody' },
]

const TRUST: { icon: typeof ShieldCheck; label: StringKey }[] = [
  { icon: ShieldCheck, label: 'landing.trustVerified' },
  { icon: KeyRound, label: 'landing.trustOtp' },
  { icon: CheckCheck, label: 'landing.trustTrail' },
]

export default function Landing() {
  return (
    <div className="plaster-ground min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 pt-6">
        <span lang="ta" className="font-display text-display-md leading-none">
          {t('app.nameScript')}
        </span>
        <span className="sr-only">{t('app.name')}</span>
        {/* Before anything asks them to read English. The landing page is where
            a Tamil or Hindi speaker actually arrives. */}
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16 pt-8">
        <section className="grid items-center gap-10 md:grid-cols-2">
          <div className="order-2 md:order-1">
            {/* The name is already the logotype in the header, so the h1 leads
                with what the product actually does rather than repeating it. */}
            <h1 className="text-balance font-display text-display-lg sm:text-display-xl">
              {t('app.tagline')}
            </h1>
            <p className="mt-4 max-w-[46ch] text-pretty text-lg text-muted-foreground">
              {t('landing.heroLede')}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12">
                <Link to="/sign-up">{t('auth.createAccount')}</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-12">
                <Link to="/sign-in">{t('auth.signIn')}</Link>
              </Button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">{t('landing.cityNote')}</p>
          </div>

          <div className="order-1 text-foreground md:order-2">
            <WallScene className="w-full" />
          </div>
        </section>

        {/* The condition gates are the single thing that stops this being a
            dump, and they are the reason an organisation will trust it. Saying
            so plainly on the front page is more honest than a feature list. */}
        <section className="mt-16 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
          <h2 className="text-balance font-display text-display-md">{t('landing.gatesTitle')}</h2>
          <p className="text-pretty text-muted-foreground">{t('landing.gatesBody')}</p>
        </section>

        <section className="mt-16 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.howTitle')}</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="hairline rounded-sm bg-card p-5">
                <span className="font-display text-display-md text-primary">{step.n}</span>
                <h3 className="mt-1 font-display text-display-sm">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.forTitle')}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {AUDIENCES.map((audience) => (
              <li key={audience.title} className="hairline rounded-sm bg-card p-5">
                <h3 className="text-balance font-display text-display-sm">{t(audience.title)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(audience.body)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 grid gap-3 sm:grid-cols-3">
          {TRUST.map(({ icon: Icon, label }) => (
            <p key={label} className="flex items-start gap-2 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t(label)}
            </p>
          ))}
        </section>

        <p className="mt-12 text-pretty border-t border-border pt-8 font-display text-display-sm">
          {t('landing.closing')}
        </p>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 text-sm text-muted-foreground">
          <span>
            <span lang="ta">{t('app.nameScript')}</span> · {t('landing.cityNote')}
          </span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="underline underline-offset-4">
              {t('legal.privacy')}
            </Link>
            <Link to="/terms" className="underline underline-offset-4">
              {t('legal.terms')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
