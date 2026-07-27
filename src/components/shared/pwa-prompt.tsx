import { useEffect, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

/**
 * Chrome fires this before showing its own install UI. Not in lib.dom yet.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

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

/** Already installed — the offer would be nonsense. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own non-standard flag, which is the only signal on older iOS.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * iPhone, iPod, or iPad.
 *
 * iPadOS 13 and later report a desktop Macintosh user agent, so the string alone
 * misses every modern iPad. Touch points are the usual tell: a real Mac reports
 * 0, an iPad reports 5.
 */
function isIos(): boolean {
  const ua = navigator.userAgent
  const iPhone = /iPad|iPhone|iPod/.test(ua)
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return iPhone || iPadOs
}

/**
 * Registers the service worker and owns the three moments it produces: a new
 * version being ready, and the app being installable on each of the two
 * platforms that matter.
 *
 * **Android and iOS need entirely different treatment.** Chrome hands us a
 * `beforeinstallprompt` event and installs on one tap. Safari has never
 * implemented that event and never will, so on iOS there is no programmatic
 * install at all — the only route is the user finding Share > Add to Home
 * Screen themselves. All we can do is tell them where it is, which means the
 * iOS path is instructions rather than a button, and pretending otherwise would
 * produce a button that does nothing.
 *
 * All of these are quiet bars at the bottom of the screen rather than modals. A
 * donor mid-post must never be interrupted by any of them.
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

  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosGuide, setShowIosGuide] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return
    if (isStandalone()) return

    const onBeforeInstall = (event: Event) => {
      // Suppress Chrome's own mini-infobar so the offer appears where the rest
      // of the product's chrome lives.
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // Once installed, Chrome fires this and the offer must go away immediately —
    // otherwise it sits there inviting someone to install what they just did.
    const onInstalled = () => {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
      setInstallEvent(null)
      setShowIosGuide(false)
    }
    window.addEventListener('appinstalled', onInstalled)

    let timer: number | undefined
    if (isIos()) {
      timer = window.setTimeout(() => setShowIosGuide(true), IOS_OFFER_DELAY_MS)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  const dismissInstall = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    setInstallEvent(null)
    setShowIosGuide(false)
  }

  const acceptInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    // The event can only be used once, whichever way the user answered.
    setInstallEvent(null)
  }

  // An update outranks an install offer: the running code being stale is the
  // more urgent of the two, and two bars at once is one too many.
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

  if (installEvent) {
    return (
      <Bar>
        <span className="text-sm">{t('pwa.installOffer')}</span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" className="min-h-11" onClick={() => void acceptInstall()}>
            {t('pwa.install')}
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={dismissInstall}>
            {t('pwa.noThanks')}
          </Button>
        </div>
      </Bar>
    )
  }

  if (showIosGuide) {
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
          onClick={dismissInstall}
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
