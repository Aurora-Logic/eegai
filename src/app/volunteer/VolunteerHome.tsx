import { AppShell } from '@/components/shared/app-shell'
import { WallEmpty } from '@/components/wall/wall'
import { t } from '@/lib/i18n'

/**
 * Placeholder shell. The pickup list, slot picker and the two OTP gates are
 * M4 — the schema, the OTP issue/verify functions and the RLS policies for all
 * of it already exist in db/migrations/006.
 */
export default function VolunteerHome() {
  return (
    <AppShell title={t('volunteer.title')} subtitle={t('volunteer.subtitle')}>
      <WallEmpty message={t('volunteer.empty')} />
    </AppShell>
  )
}
