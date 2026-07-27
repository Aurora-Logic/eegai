import { AppShell } from '@/components/shared/app-shell'
import { WallEmpty } from '@/components/wall/wall'
import { t } from '@/lib/i18n'

/**
 * Placeholder shell. The verification queues, document viewer and dispute view
 * are M7. The admin-only RLS they depend on is already in place and tested —
 * see server/tests/rls.test.ts.
 */
export default function AdminHome() {
  return (
    <AppShell title={t('admin.title')} subtitle={t('admin.subtitle')}>
      <WallEmpty message={t('admin.empty')} />
    </AppShell>
  )
}
