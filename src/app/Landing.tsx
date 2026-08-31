import { Link } from 'react-router-dom'
import { CheckCheck, Droplet, KeyRound, Package, ShieldCheck } from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { Button } from '@/components/ui/button'
import { WallScene } from '@/components/illustrations'
import { Disclosure } from '@/components/health/disclosure'
import { t } from '@/lib/i18n'
import type { StringKey } from '@/lib/i18n'

/** The goods lane, compressed to one line per step. */
const GOODS_STEPS: StringKey[] = ['landing.goodsStep1', 'landing.goodsStep2', 'landing.goodsStep3']

const STEPS: { n: string; title: StringKey; body: StringKey }[] = [
  { n: '1', title: 'landing.step1Title', body: 'landing.step1Body' },
  { n: '2', title: 'landing.step2Title', body: 'landing.step2Body' },
  { n: '3', title: 'landing.step3Title', body: 'landing.step3Body' },
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

        {/* The two lanes, health first.
            EEGAI is a coordination layer for blood, hair and breast milk, and
            a wall for second-hand goods. They are different promises — one
            ends with the donor walking into a hospital, the other with a
            volunteer at a door — so somebody deciding whether to sign up needs
            to see both, and to see which one leads. */}
        <section className="mt-16 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.lanesTitle')}</h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="hairline rounded-sm bg-card p-5 ring-1 ring-primary/30">
              <p className="flex items-center gap-2">
                <Droplet className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="font-display text-display-sm">{t('landing.laneHealthTitle')}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{t('landing.laneHealthBody')}</p>
            </div>

            <div className="hairline rounded-sm bg-card p-5">
              <p className="flex items-center gap-2">
                <Package className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-display text-display-sm">{t('landing.laneGoodsTitle')}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{t('landing.laneGoodsBody')}</p>
            </div>
          </div>

          {/* Brief §8 marks this required. It belongs here too: this is the page
              somebody reads before deciding whether to hand over a number. */}
          <Disclosure className="mt-4" />
        </section>

        <section className="mt-16 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.howTitle')}</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="hairline rounded-sm bg-card p-5">
                <span className="font-display text-display-md text-primary">{step.n}</span>
                <h3 className="mt-1 font-display text-display-sm">{t(step.title)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(step.body)}</p>
              </li>
            ))}
          </ol>

          {/* The goods lane, in a sentence each rather than three cards. It is
              still here and still works; it is simply no longer the thing this
              page is about. */}
          <h3 className="mt-10 font-display text-display-sm">{t('landing.goodsHowTitle')}</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {GOODS_STEPS.map((key) => (
              <li key={key} className="flex items-start gap-2">
                <Package className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t(key)}
              </li>
            ))}
          </ul>
        </section>
        {/* The condition gates are the single thing that stops this being a
            dump, and they are the reason an organisation will trust it. Saying
            so plainly on the front page is more honest than a feature list. */}
        <section className="mt-16 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
          <h2 className="text-balance font-display text-display-md">{t('landing.gatesTitle')}</h2>
          <p className="text-pretty text-muted-foreground">{t('landing.gatesBody')}</p>
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
            <Link to="/privacy" className="inline-block py-2 underline underline-offset-4">
              {t('legal.privacy')}
            </Link>
            <Link to="/terms" className="inline-block py-2 underline underline-offset-4">
              {t('legal.terms')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
