import { Link } from 'react-router-dom'
import {
  CheckCheck,
  Droplet,
  EyeOff,
  KeyRound,
  Package,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { FlowDiagram } from '@/components/shared/flow-diagram'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/health/disclosure'
import { HEALTH_FLOW } from '@/lib/flows'
import { t } from '@/lib/i18n'
import type { StringKey } from '@/lib/i18n'

/**
 * The front door.
 *
 * Rebuilt around the motto and the health lane. The previous version opened
 * with a drawing of a brick wall and then explained, in detail and in order, a
 * product that is now the second of two — somebody arriving to give blood read
 * three cards about photographing a sofa before reaching anything that applied
 * to them.
 *
 * The motto is the thesis and is set large enough to be one. Under it the two
 * lanes, then the journey drawn with arrows — the same component the in-app
 * manual renders, so what this page promises and what the app later explains
 * cannot drift apart.
 *
 * There is no hero illustration any more. The old one drew the goods wall, and
 * a drawing of the health lane would be new artwork rather than a
 * rearrangement; a bad one is worse than none. The type carries it.
 */

/** The goods lane, compressed to one line per step. */
const GOODS_STEPS: StringKey[] = ['landing.goodsStep1', 'landing.goodsStep2', 'landing.goodsStep3']

/**
 * Brief §5's rules, as promises rather than clauses.
 *
 * They are the strongest thing this product can say to somebody deciding
 * whether to hand over a phone number, and a privacy policy is not where that
 * person is looking.
 */
const PROMISES: { icon: typeof EyeOff; label: StringKey }[] = [
  { icon: EyeOff, label: 'landing.privacyLocation' },
  { icon: KeyRound, label: 'landing.privacyContact' },
  { icon: Stethoscope, label: 'landing.privacyMedical' },
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
        {/* Before anything asks them to read English. */}
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16 pt-10">
        {/* ---- the motto, with nothing competing with it ---- */}
        <section>
          <h1 className="max-w-[16ch] text-balance font-display text-display-xl leading-[1.05]">
            {t('app.tagline')}
          </h1>
          <p className="mt-5 max-w-[46ch] text-pretty text-lg text-muted-foreground">
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
        </section>

        {/* ---- the two lanes, health first ---- */}
        <section className="mt-14 border-t border-border pt-10">
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
        </section>

        {/* ---- the journey, drawn ---- */}
        <section className="mt-14 border-t border-border pt-10">
          <div className="mb-4">
            <h2 className="font-display text-display-md">{t('landing.howTitle')}</h2>
            <p className="mt-1 text-muted-foreground">{t('landing.howLede')}</p>
          </div>

          <FlowDiagram title={t('landing.laneHealthTitle')} steps={HEALTH_FLOW.donor} />

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

        {/* ---- what we never do ---- */}
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.privacyTitle')}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {PROMISES.map(({ icon: Icon, label }) => (
              <li key={label} className="hairline rounded-sm bg-card p-5">
                <Icon className="size-5 text-primary" aria-hidden />
                <p className="mt-2 text-sm text-muted-foreground">{t(label)}</p>
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

        <Disclosure className="mt-8" />

        <p className="mt-12 text-pretty border-t border-border pt-8 font-display text-display-sm">
          {t('landing.closing')}
        </p>
      </main>

      <footer className="border-t border-border">
        {/* pb-20 for the same reason AppShell carries pb-24: the dev role
            switcher is fixed to the bottom of the viewport, and without room
            below the links it sits on top of them. It caught this by failing
            to click Privacy. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 pb-20 pt-6 text-sm text-muted-foreground">
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
            {/* The manual is public: somebody can be told to read it before they
                have an account. */}
            <Link to="/guide" className="inline-block py-2 underline underline-offset-4">
              {t('guide.open')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
