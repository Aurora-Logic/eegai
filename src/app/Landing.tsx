import { Link } from 'react-router-dom'
import {
  Baby,
  Boxes,
  CheckCheck,
  Droplet,
  EyeOff,
  HandHeart,
  Hospital,
  KeyRound,
  MapPin,
  Network,
  Package,
  Scissors,
  ShieldCheck,
  Stethoscope,
  Truck,
  UserRoundCheck,
} from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { FlowDiagram } from '@/components/shared/flow-diagram'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/health/disclosure'
import { GOODS_FLOW, HAIR_FLOW, HEALTH_FLOW, MILK_FLOW } from '@/lib/flows'
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
 * The motto is the thesis and is set large enough to be one. Under it the four
 * roles and the four donation types from the donor-module spec, its key notes,
 * then each journey drawn with arrows — the same component and the same data
 * the in-app manual renders, so what this page promises and what the app later
 * explains cannot drift apart.
 *
 * There is no hero illustration any more. The old one drew the goods wall, and
 * a drawing of the health lane would be new artwork rather than a
 * rearrangement; a bad one is worse than none. The type carries it.
 */

/** The spec's home page: four roles, Hospital carrying its terms. */
const ROLES: { icon: typeof Hospital; label: StringKey; body: StringKey; terms?: boolean }[] = [
  { icon: Hospital, label: 'auth.roleHospital', body: 'landing.roleHospitalBody', terms: true },
  { icon: Boxes, label: 'auth.roleNgo', body: 'landing.roleNgoBody' },
  { icon: HandHeart, label: 'auth.roleDonor', body: 'landing.roleDonorBody' },
  { icon: Truck, label: 'auth.roleVolunteer', body: 'landing.roleDeliveryBody' },
]

const TYPES: { icon: typeof Droplet; label: StringKey; body: StringKey }[] = [
  { icon: Droplet, label: 'landing.typeBlood', body: 'landing.typeBloodBody' },
  { icon: Scissors, label: 'landing.typeHair', body: 'landing.typeHairBody' },
  { icon: Baby, label: 'landing.typeMilk', body: 'landing.typeMilkBody' },
  { icon: Package, label: 'landing.typeMaterial', body: 'landing.typeMaterialBody' },
]

const NOTES: { icon: typeof Droplet; label: StringKey }[] = [
  { icon: UserRoundCheck, label: 'landing.note1' },
  { icon: MapPin, label: 'landing.note2' },
  { icon: KeyRound, label: 'landing.note3' },
  { icon: Network, label: 'landing.note4' },
]

const FLOWS: { title: StringKey; steps: typeof GOODS_FLOW }[] = [
  { title: 'landing.flowBlood', steps: HEALTH_FLOW.donor },
  { title: 'landing.flowHair', steps: HAIR_FLOW },
  { title: 'landing.flowMilk', steps: MILK_FLOW },
  { title: 'landing.flowMaterial', steps: GOODS_FLOW },
]

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

        {/* ---- the four roles ---- */}
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.rolesTitle')}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(({ icon: Icon, label, body, terms }) => (
              <li key={label} className="hairline flex flex-col rounded-sm bg-card p-5">
                <Icon className="size-6 text-primary" aria-hidden />
                <p className="mt-3 font-display text-display-sm">{t(label)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t(body)}</p>
                {terms ? (
                  <Link to="/terms" className="mt-auto pt-3 text-xs underline underline-offset-4">
                    {t('auth.termsApply')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* ---- what a donor can give ---- */}
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.typesTitle')}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {TYPES.map(({ icon: Icon, label, body }, index) => (
              <li
                key={label}
                className={
                  index === 0
                    ? 'hairline flex gap-4 rounded-sm bg-card p-5 ring-1 ring-primary/30'
                    : 'hairline flex gap-4 rounded-sm bg-card p-5'
                }
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-display-sm">{t(label)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(body)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- the spec's key notes ---- */}
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="font-display text-display-md">{t('landing.notesTitle')}</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {NOTES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-3 text-sm">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                {t(label)}
              </li>
            ))}
          </ul>
        </section>

        {/* ---- each journey, drawn ---- */}
        <section className="mt-14 border-t border-border pt-10">
          <div className="mb-4">
            <h2 className="font-display text-display-md">{t('landing.howTitle')}</h2>
            <p className="mt-1 text-muted-foreground">{t('landing.howLede')}</p>
          </div>

          <div className="space-y-8">
            {FLOWS.map((flow) => (
              <FlowDiagram key={flow.title} title={t(flow.title)} steps={flow.steps} />
            ))}
          </div>
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
