import { CloudOff } from 'lucide-react'
import { useOnline } from '@/hooks/use-online'
import { t } from '@/lib/i18n'

/**
 * States what happened and what you can still do — it does not apologise
 * (PLAN.md §8, copy rules).
 */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null

  return (
    <div
      role="status"
      className="flex items-center gap-2 bg-muted px-4 py-2 text-sm text-muted-foreground"
    >
      <CloudOff className="size-4 shrink-0" aria-hidden />
      <span>{t('pwa.offline')}</span>
    </div>
  )
}
