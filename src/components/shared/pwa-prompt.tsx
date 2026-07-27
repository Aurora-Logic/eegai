import { useEffect, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
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
 * Registers the service worker and owns the two moments it produces: a new
 * version being ready, and the app being installable.
 *
 * Both are deliberately quiet bars at the bottom of the screen rather than
 * modals. A donor mid-post must never be interrupted by either.
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

  useEffect(() => {
    if (localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return

    const onBeforeInstall = (event: Event) => {
      // Suppress Chrome's own mini-infobar so the offer appears where the rest
      // of the product's chrome lives.
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const dismissInstall = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    setInstallEvent(null)
  }

  const acceptInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    // The event can only be used once, whichever way the user answered.
    setInstallEvent(null)
  }

  if (needRefresh) {
    return (
      <Bar>
        <span className="text-sm">{t('pwa.updateReady')}</span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => void updateServiceWorker(true)}>
            {t('pwa.reload')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
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
          <Button size="sm" onClick={() => void acceptInstall()}>
            {t('pwa.install')}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismissInstall}>
            {t('pwa.noThanks')}
          </Button>
        </div>
      </Bar>
    )
  }

  return null
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
