import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes,
  HandHeart,
  Hospital,
  KeyRound,
  MapPin,
  Network,
  Truck,
  UserRoundCheck,
} from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import {
  GIVING_KINDS,
  GivingJourney,
  GivingWall,
  type GivingKind,
} from '@/components/landing/giving-wall'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/health/disclosure'
import { t } from '@/lib/i18n'
import type { StringKey } from '@/lib/i18n'

/**
 * The front door.
 *
 * Built around the one thing this product is named for. EEGAI is a wall people
 * hang things on, so the page opens with a wall: four bricks, one per kind of
 * donation, laid in a running bond with mortar gaps and ink hairlines. It is
 * not a drawing of the idea — it is how the page works. Press a brick and the
 * journey below becomes that journey.
 *
 * That is also what fixed the page. It used to print four flow diagrams one
 * after another, under a grid of four cards saying the same four words, under
 * two more lists; the whole thing read as a document. Now the four appear once,
 * as objects, and only the journey somebody actually asked for is drawn.
 *
 * The eyebrow labels are set in the mono face, in the manner of the stamp on a
 * kraft parcel — the same vocabulary the goods lane uses on every label.
 */

/** The spec's home page: four roles, Hospital carrying its terms. */
const ROLES: { icon: typeof Hospital; label: StringKey; body: StringKey; terms?: boolean }[] = [
  { icon: Hospital, label: 'auth.roleHospital', body: 'landing.roleHospitalBody', terms: true },
  { icon: Boxes, label: 'auth.roleNgo', body: 'landing.roleNgoBody' },
  { icon: HandHeart, label: 'auth.roleDonor', body: 'landing.roleDonorBody' },
  { icon: Truck, label: 'auth.roleVolunteer', body: 'landing.roleDeliveryBody' },
]

/**
 * What the product promises, and what it will not do.
 *
 * The strongest thing this page can say to somebody deciding whether to hand
 * over a phone number, so it is set as four stamped promises rather than two
 * bulleted lists of prose.
 */
const PROMISES: { icon: typeof MapPin; label: StringKey }[] = [
  { icon: UserRoundCheck, label: 'landing.note1' },
  { icon: MapPin, label: 'landing.privacyLocation' },
  { icon: KeyRound, label: 'landing.privacyContact' },
  { icon: Network, label: 'landing.note4' },
]

/**
 * A section's title, set like the stamp on a kraft parcel.
 *
 * A real heading underneath: the stamp styling is for the eye, and a screen
 * reader navigating by headings should find every section, not just the motto.
 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-xs font-normal uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  )
}

export default function Landing() {
  // The wall and the journey are one interaction, so the choice lives here and
  // the journey is drawn at full width underneath both columns.
  const [kind, setKind] = useState<GivingKind>(GIVING_KINDS[0] as GivingKind)

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
        {/* ---- the motto, and the wall it opens ---- */}
        <section className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
          <div className="lg:pt-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('landing.cityNote')}
            </p>
            <h1 className="mt-4 max-w-[14ch] text-balance font-display text-display-lg leading-[1.02] sm:text-display-xl">
              {t('app.tagline')}
            </h1>
            <p className="mt-5 max-w-[42ch] text-pretty text-lg text-muted-foreground">
              {t('landing.heroLede')}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12">
                <Link to="/sign-up">{t('auth.createAccount')}</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-12">
                <Link to="/sign-in">{t('auth.signIn')}</Link>
              </Button>
            </div>
          </div>

          <div>
            <Eyebrow>{t('landing.pickTitle')}</Eyebrow>
            <p className="mt-1 text-sm text-muted-foreground">{t('landing.pickHint')}</p>
            <GivingWall chosen={kind} onChoose={setKind} className="mt-4" />
          </div>
        </section>

        <GivingJourney chosen={kind} className="mt-10" />

        {/* ---- the four roles ---- */}
        <section className="mt-16 border-t border-border pt-10">
          <Eyebrow>{t('landing.whoTitle')}</Eyebrow>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(({ icon: Icon, label, body, terms }) => (
              <li key={label} className="hairline flex flex-col rounded-sm bg-card p-4">
                <Icon className="size-5 text-primary" aria-hidden />
                <p className="mt-3 font-display text-display-sm leading-none">{t(label)}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t(body)}</p>
                {terms ? (
                  <Link to="/terms" className="mt-auto pt-3 text-xs underline underline-offset-4">
                    {t('auth.termsApply')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* ---- what is promised, and what is never done ---- */}
        <section className="mt-16 border-t border-border pt-10">
          <Eyebrow>{t('landing.notesTitle')}</Eyebrow>
          <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {PROMISES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span className="text-pretty text-sm">{t(label)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- the closing line, and the way in ---- */}
        <section className="mt-16 border-t border-border pt-10">
          <p className="max-w-[28ch] text-balance font-display text-display-md leading-[1.1]">
            {t('landing.closing')}
          </p>
          <Button asChild size="lg" className="mt-6 min-h-12">
            <Link to="/sign-up">{t('auth.createAccount')}</Link>
          </Button>
        </section>

        <Disclosure className="mt-12" />
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
