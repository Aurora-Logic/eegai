import { Link } from 'react-router-dom'
import { LogOut, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
          <Link to="/" className="font-display text-display-sm">
            {t('app.name')}
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={t('theme.toggle')}>
              {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void signOut()}
              aria-label={t('auth.signOut')}
            >
              <LogOut aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-display-md">{title}</h1>
            {subtitle ? <p className="mt-1 text-muted-foreground">{subtitle}</p> : null}
            {user ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {user.fullName} · {user.role}
              </p>
            ) : null}
          </div>
          {actions}
        </div>

        {children}
      </main>
    </div>
  )
}
