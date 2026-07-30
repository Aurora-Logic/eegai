import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HOME_FOR_ROLE, useSession } from '@/hooks/use-session'
import { t } from '@/lib/i18n'

/**
 * One back control, on every screen that is not somebody's home.
 *
 * Screens were each deciding for themselves, so some had a Back button, some had
 * a "Your items" link, and the post wizard had neither — on a phone the only way
 * out of it was the browser gesture, which is invisible in an installed PWA
 * because there is no browser chrome to gesture at. That is the case this
 * exists for.
 *
 * `history.back()` when there is history to go back to, and the role's home when
 * there is not. A deep link, a fresh install, or a reload leaves an empty stack —
 * and a Back button that does nothing is worse than no Back button, because the
 * reader concludes the app is broken rather than that they are at the start.
 */
export function BackLink() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useSession()

  const home = user ? HOME_FOR_ROLE[user.role] : '/'

  // Already home: there is nothing above this, and an arrow pointing at the
  // screen you are on is a lie.
  if (location.pathname === home) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      className="-ml-2 min-h-11 shrink-0"
      aria-label={t('action.back')}
      onClick={() => {
        // `idx` is react-router's position in its own stack. 0 means this is the
        // first entry, so there is nowhere to go back to.
        const state = location.state as { idx?: number } | null
        const hasHistory =
          typeof state?.idx === 'number' ? state.idx > 0 : window.history.length > 1
        if (hasHistory) navigate(-1)
        else navigate(home, { replace: true })
      }}
    >
      <ArrowLeft aria-hidden />
    </Button>
  )
}
