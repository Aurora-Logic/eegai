import { useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { promptInstall, useInstallKind } from '@/lib/install'

/**
 * An explicit way to install, for anyone who dismissed the automatic offer or
 * never met it.
 *
 * The automatic bar appears once and then respects a permanent dismissal, which
 * leaves no route back. That is fine for a nudge and wrong for a capability —
 * "how do I get this on my phone" should be answerable from the screen you are
 * on, not by clearing site data.
 *
 * Renders nothing when the app is already installed or the browser will never
 * offer it, so it costs no header space on a desktop or inside the installed
 * app itself.
 */
export function InstallButton() {
  const kind = useInstallKind()
  const [showIosSheet, setShowIosSheet] = useState(false)

  if (kind === 'unavailable') return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11"
        aria-label={t('pwa.installTitle')}
        title={t('pwa.installTitle')}
        onClick={() => {
          if (kind === 'prompt') void promptInstall()
          else setShowIosSheet(true)
        }}
      >
        <Download aria-hidden />
      </Button>

      {/* iOS has no programmatic install, so the button can only point at
          Safari's own menu. Saying so plainly beats a button that appears to
          do nothing. */}
      {showIosSheet ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('pwa.installTitle')}
          onClick={() => setShowIosSheet(false)}
        >
          <div
            className="hairline w-full max-w-md rounded-sm bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{t('pwa.installTitle')}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('pwa.installBody')}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="min-h-11 shrink-0"
                aria-label={t('pwa.gotIt')}
                onClick={() => setShowIosSheet(false)}
              >
                <X aria-hidden />
              </Button>
            </div>

            <ol className="mt-3 space-y-2 text-sm">
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
        </div>
      ) : null}
    </>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
      {n}
    </span>
  )
}
