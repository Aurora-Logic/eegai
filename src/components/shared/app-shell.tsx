import { Link } from 'react-router-dom'
import { LogOut, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
          {/* The name in both scripts, always together. Tamil is the language of
              the city this launches in, and showing it only on the landing page
              would make it decoration rather than the name. The Tamil sits on
              the same baseline at a slightly larger size because Noto Sans Tamil
              runs optically smaller than Bricolage at equal point size. */}
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-display-sm">{t('app.name')}</span>
            <span aria-hidden className="text-lg leading-none text-muted-foreground">
              {t('app.nameScript')}
            </span>
          </Link>
          <div className="flex items-center gap-1">
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
