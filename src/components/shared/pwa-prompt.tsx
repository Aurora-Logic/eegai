import { useEffect, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { promptInstall, useInstallKind } from '@/lib/install'

const INSTALL_DISMISSED_KEY = 'eegai.install-dismissed'

/**
 * How long to wait before offering installation on iOS.
 *
 * Chrome gates `beforeinstallprompt` behind its own engagement heuristics, so on
 * Android the offer already arrives at a sensible moment. iOS gives us no such
 * signal — an unguarded card would meet every first-time visitor before they had
 * seen a single item, which is how you teach someone to dismiss things. Thirty
 * seconds is a crude stand-in for "this person is actually looking".
 */
const IOS_OFFER_DELAY_MS = 30_000

/**
 * Registers the service worker and owns the two moments it produces: a new
 * version being ready, and the app being installable.
 *
 * The installability detection itself lives in `lib/install.ts`, shared with the
 * explicit button in the header — its listener is registered at module load
 * because Chrome routinely fires `beforeinstallprompt` before React mounts.
 *
 * This component is only the *automatic* offer, and it takes a permanent
 * dismissal seriously. That is exactly why the header button exists: a nudge may
 * be declined forever, but the capability has to stay reachable.
 *
 * All of these are quiet bars at the bottom rather than modals. A donor mid-post
 * must never be interrupted by any of them.
 */
export function PwaPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error)
    },
  })

  const installKind = useInstallKind()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(INSTALL_DISMISSED_KEY) === '1',
  )
  const [iosDelayPassed, setIosDelayPassed] = useState(false)

  useEffect(() => {
    if (installKind !== 'ios-instructions' || dismissed) return
    const timer = window.setTimeout(() => setIosDelayPassed(true), IOS_OFFER_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [installKind, dismissed])

  const dismiss = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    setDismissed(true)
  }

  // An update outranks an install offer: stale running code is the more urgent
  // of the two, and two bars at once is one too many.
  if (needRefresh) {
    return (
      <Bar>
        <span className="text-sm">{t('pwa.updateReady')}</span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" className="min-h-11" onClick={() => void updateServiceWorker(true)}>
            {t('pwa.reload')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => setNeedRefresh(false)}
          >
            {t('pwa.later')}
          </Button>
        </div>
      </Bar>
    )
  }

  if (dismissed) return null

  if (installKind === 'prompt') {
    return (
      <Bar>
        <span className="text-sm">{t('pwa.installOffer')}</span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" className="min-h-11" onClick={() => void promptInstall()}>
            {t('pwa.install')}
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={dismiss}>
            {t('pwa.noThanks')}
          </Button>
        </div>
      </Bar>
    )
  }

  if (installKind === 'ios-instructions' && iosDelayPassed) {
    return (
      <Bar>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('pwa.installTitle')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('pwa.installBody')}</p>

          {/* Numbered because it is a route through someone else's UI, not ours.
              The share glyph is drawn inline so they are looking for a shape
              rather than parsing the word "share". */}
          <ol className="mt-2 space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <Step n={1} />
              <span className="inline-flex flex-wrap items-center gap-1">
                {t('pwa.iosStep1')}
                <Share className="size-4 shrink-0 text-primary" aria-hidden />
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Step n={2} />
              <span>{t('pwa.iosStep2')}</span>
            </li>
          </ol>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="min-h-11 shrink-0 self-start"
          onClick={dismiss}
          aria-label={t('pwa.gotIt')}
        >
          <X aria-hidden />
        </Button>
      </Bar>
    )
  }

  return null
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
      {n}
    </span>
  )
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="hairline fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-card-foreground"
    >
      {children}
    </div>
  )
}
