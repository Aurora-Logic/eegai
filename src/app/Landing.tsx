import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { WallScene } from '@/components/illustrations'
import { t } from '@/lib/i18n'

const STEPS = [
  { n: '1', title: 'Photograph it', body: 'One minute, up to five photos, from your phone.' },
  { n: '2', title: 'An NGO claims it', body: 'Verified organisations near you, first claim wins.' },
  { n: '3', title: 'It gets collected', body: 'A courier, or a vetted volunteer at your door.' },
]

export default function Landing() {
  return (
    <main className="plaster-ground min-h-dvh">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <section className="grid items-center gap-10 md:grid-cols-2">
          <div className="order-2 md:order-1">
            <h1 className="max-w-[16ch] text-balance font-display text-display-lg sm:text-display-xl">
              {t('app.name')}
            </h1>
            <p className="mt-4 max-w-[42ch] text-lg text-muted-foreground">{t('app.tagline')}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/sign-up">{t('auth.createAccount')}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/sign-in">{t('auth.signIn')}</Link>
              </Button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">{t('landing.cityNote')}</p>
          </div>

          <div className="order-1 text-foreground md:order-2">
            <WallScene className="w-full" />
          </div>
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

        <footer className="mt-12 border-t border-border pt-6">
          <Link
            to="/style-guide"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            {t('styleguide.title')}
          </Link>
        </footer>
      </div>
    </main>
  )
}
