import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { HOME_FOR_ROLE, useSession } from '@/hooks/use-session'
import type { Role } from '@/lib/state-machine'

/**
 * A development-only way to become any of the four roles instantly.
 *
 * Walking a donation from posted to acknowledged means being a donor, an NGO, a
 * volunteer and then the NGO again. Signing in and out four times per pass is
 * most of the cost of checking a change by hand.
 *
 * Two things keep it out of production. `import.meta.env.DEV` is a literal that
 * Vite replaces at build time, so the early return below makes this whole
 * component — and its `/auth/dev-login` call — dead code that Rollup drops from
 * the production bundle entirely. The endpoint itself independently 404s outside
 * NODE_ENV=development, which is the guarantee that actually matters; this is
 * only the door being hidden.
 */
const ROLES: { role: Role; label: string; hint: string }[] = [
  { role: 'donor', label: 'Donor', hint: 'posts items' },
  { role: 'ngo', label: 'NGO', hint: 'claims and acknowledges' },
  { role: 'volunteer', label: 'Volunteer', hint: 'collects and delivers' },
  { role: 'admin', label: 'Admin', hint: 'verifies and disputes' },
]

export function DevRoleSwitcher() {
  if (!import.meta.env.DEV) return null
  return <Switcher />
}

function Switcher() {
  const { user } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Role | null>(null)

  async function become(role: Role) {
    setBusy(role)
    try {
      await api.post('/auth/dev-login', { role })
      // Everything cached belongs to the previous person. Clearing rather than
      // invalidating means no stale donor list flashes up under an NGO's header.
      queryClient.clear()
      navigate(HOME_FOR_ROLE[role], { replace: true })
      setOpen(false)
    } catch {
      // The endpoint is gone or the database has no seed. Nothing to recover,
      // and this is a dev tool, so it says so and stops.
      window.alert('Dev login failed. Is the API running in development, and is the seed loaded?')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 print:hidden">
      {open ? (
        <div className="hairline w-56 rounded-sm bg-card p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              dev · sign in as
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the role switcher"
              className="rounded-sm p-1 hover:bg-foreground/10"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          <ul>
            {ROLES.map(({ role, label, hint }) => (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => void become(role)}
                  disabled={busy !== null}
                  className={cn(
                    'flex min-h-11 w-full items-baseline gap-2 rounded-sm px-2 text-left hover:bg-foreground/10 disabled:opacity-50',
                    user?.role === role && 'bg-foreground/5',
                  )}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                  {busy === role ? <span className="ml-auto text-xs">…</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hairline flex min-h-11 items-center gap-1.5 rounded-sm bg-card px-3 font-mono text-xs shadow-lg"
        >
          dev · {user?.role ?? 'signed out'}
          <ChevronUp className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
