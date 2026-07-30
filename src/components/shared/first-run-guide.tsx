import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { GUIDE } from '@/lib/guide'
import { useSession } from '@/hooks/use-session'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const SEEN_KEY = 'eegai.guide-seen'

/**
 * Shown once, the first time somebody opens the app signed in.
 *
 * It renders the same GUIDE the manual does, rather than its own copy. Two
 * explanations of the same product drift apart, and the one nobody reads twice
 * is the one that goes stale — so there is exactly one.
 *
 * Dismissed permanently, per role. Someone who signs in as a donor and later
 * becomes a volunteer is genuinely looking at a different product and should be
 * shown it once too.
 *
 * A sheet from the bottom rather than a centred modal: on a phone this is four
 * screens of reading, and the thumb is at the bottom.
 */
export function FirstRunGuide() {
  const { user, isLoading } = useSession()
  const [step, setStep] = useState(0)

  // Read on every render, not in a useState initialiser. The initialiser runs
  // once — before the session has loaded — when `user` is still null and the key
  // is therefore the wrong one. It computed "not seen" from a key nobody writes,
  // so a returning donor was shown the guide again on every visit, and the e2e
  // suite found two "Next" buttons on the post wizard.
  const seenKey = user ? `${SEEN_KEY}.${user.role}` : null
  const [dismissedNow, setDismissedNow] = useState(false)

  let alreadySeen = false
  try {
    alreadySeen = seenKey !== null && localStorage.getItem(seenKey) === '1'
  } catch {
    // Private browsing can throw. Showing the guide twice is a smaller failure
    // than not rendering the app.
  }

  if (isLoading || !user || alreadySeen || dismissedNow) return null

  const steps = GUIDE[user.role]
  const current = steps[step]
  if (!current) return null

  const last = step === steps.length - 1

  function close() {
    try {
      if (seenKey) localStorage.setItem(seenKey, '1')
    } catch {
      // Not worth failing over; they see it again next time.
    }
    setDismissedNow(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('guide.title')}
    >
      <div className="hairline w-full max-w-md rounded-sm bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-display-sm">{t('guide.title')}</p>
          <Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={close}>
            {t('guide.skip')}
          </Button>
        </div>

        <div className="mt-4 flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <current.icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{current.title}</p>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">{current.body}</p>
          </div>
        </div>

        {/* Position, so nobody wonders how much more there is. */}
        <div className="mt-5 flex items-center gap-3">
          <ol className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((s, index) => (
              <li
                key={s.title}
                aria-current={index === step}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  index <= step ? 'bg-primary' : 'bg-border',
                )}
              />
            ))}
          </ol>

          <Button
            className="min-h-11 shrink-0"
            onClick={() => (last ? close() : setStep(step + 1))}
          >
            {last ? t('guide.done') : t('guide.next')}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          You can read this again any time —{' '}
          <Link to="/guide" className="underline underline-offset-4" onClick={close}>
            {t('guide.open')}
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
