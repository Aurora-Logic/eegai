import { useSyncExternalStore } from 'react'

/**
 * Installability, shared between the automatic offer and the explicit button.
 *
 * The listener is registered at module load rather than in an effect. Chrome
 * fires `beforeinstallprompt` as soon as it decides the page qualifies, which is
 * routinely *before* React has mounted — an effect-based listener misses it, and
 * the app then believes it cannot be installed for the rest of the session. That
 * is the single most common reason an install button does nothing.
 *
 * Only one event is ever held. It can be used exactly once, so it is dropped
 * after prompting and Chrome will hand us a fresh one if the page still
 * qualifies.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallKind =
  /** Chrome gave us an event — one tap installs. */
  | 'prompt'
  /** iOS: no programmatic install exists, so we can only give directions. */
  | 'ios-instructions'
  /** Already installed, or the browser will never offer it. */
  | 'unavailable'

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Already running as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own non-standard flag, and the only signal on older iOS.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * iPhone, iPod, or iPad.
 *
 * iPadOS 13 and later report a desktop Macintosh user agent, so a string test
 * alone misses every modern iPad. Touch points are the tell: a real Mac reports
 * 0, an iPad reports 5.
 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar so the offer appears where the rest of
    // the product's chrome lives.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    emit()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}

function snapshot(): InstallKind {
  if (installed || isStandalone()) return 'unavailable'
  if (deferred) return 'prompt'
  if (isIos()) return 'ios-instructions'
  return 'unavailable'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** What, if anything, we can offer this browser right now. */
export function useInstallKind(): InstallKind {
  return useSyncExternalStore(subscribe, snapshot, () => 'unavailable' as const)
}

/**
 * Runs Chrome's install flow. Resolves to whether the user accepted.
 *
 * Returns false rather than throwing when there is no event to use, so a caller
 * that races the state does not blow up mid-tap.
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false

  // Cleared before awaiting: the event is single-use, and leaving it in place
  // lets a double-tap call prompt() twice, which Chrome rejects.
  deferred = null
  emit()

  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}
