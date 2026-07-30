import { Link } from 'react-router-dom'
import { CircleHelp, LogOut, Moon, Sun, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { BackLink } from '@/components/shared/back-link'
import { HeaderMenu } from '@/components/shared/header-menu'
import { Link as RouterLink } from 'react-router-dom'
import { InstallButton } from '@/components/shared/install-button'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { useSession } from '@/hooks/use-session'
import { useTheme } from '@/hooks/use-theme'
import { t } from '@/lib/i18n'

/** The frame every signed-in screen sits in. */
export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  // `| undefined` explicitly, because exactOptionalPropertyTypes distinguishes
  // "absent" from "present and undefined", and callers pass the latter.
  subtitle?: string | undefined
  actions?: ReactNode | undefined
  children: ReactNode
}) {
  const { user, signOut } = useSession()
  const { theme, toggle } = useTheme()

  return (
    <div className="plaster-ground min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          {/* The logotype is the Tamil wordmark alone. `lang` so a screen reader
              reaches for a Tamil voice, and an sr-only Latin name so the link
              still announces as EEGAI to anyone whose reader has no Tamil. */}
          {/* Back sits before the wordmark, where a thumb reaches on a phone
              and where every other app puts it. */}
          <BackLink />
          <Link to="/" className="mr-auto flex items-baseline gap-2 py-2">
            <span lang="ta" className="font-display text-display-md leading-none">
              {t('app.nameScript')}
            </span>
            <span className="sr-only">{t('app.name')}</span>
          </Link>
          {/* Below `sm` the same actions collapse into one menu. Seven controls
              in a 360px header cannot each keep a 44px target, and the row was
              running to the edge; see header-menu.tsx. */}
          <div className="sm:hidden">
            <HeaderMenu />
          </div>

          <div className="hidden items-center gap-1 sm:flex">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="min-h-11"
              aria-label="Your details"
              title="Your details"
            >
              <RouterLink to="/profile">
                <UserRound aria-hidden />
              </RouterLink>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="min-h-11"
              aria-label={t('guide.open')}
              title={t('guide.open')}
            >
              <RouterLink to="/guide">
                <CircleHelp aria-hidden />
              </RouterLink>
            </Button>
            <LanguageSwitcher />
            <InstallButton />
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11"
              onClick={toggle}
              aria-label={t('theme.toggle')}
            >
              {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11"
              onClick={() => void signOut()}
              aria-label={t('auth.signOut')}
            >
              <LogOut aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      {/* pb-24 leaves room for the dev switcher and any sticky action bar to sit
          above the last row of content rather than on top of it. */}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        {/* Stacked on a phone with actions full width underneath the heading;
            side by side from `sm` up, where there is room for both. */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-balance font-display text-display-md">{title}</h1>
            {subtitle ? <p className="mt-1 text-pretty text-muted-foreground">{subtitle}</p> : null}
            {user ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {user.fullName} · {user.role}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="shrink-0 [&_a]:min-h-11 [&_button]:min-h-11">{actions}</div>
          ) : null}
        </div>

        {children}
      </main>
    </div>
  )
}
