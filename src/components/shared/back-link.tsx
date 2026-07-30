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
        // `location.key` is 'default' only for the very first entry react-router
        // ever rendered — a deep link, a shared URL, a cold start of the
        // installed app. Anything else means there is somewhere of ours to go.
        //
        // `window.history.length > 1` looked like the same check and is not: the
        // browser counts entries from before the app was loaded, so on a
        // deep-linked page it said "yes, go back" and navigate(-1) walked out of
        // the app entirely — to about:blank in a fresh tab.
        if (location.key === 'default') navigate(home, { replace: true })
        else navigate(-1)
      }}
    >
      <ArrowLeft aria-hidden />
    </Button>
  )
}
