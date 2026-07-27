import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AppShell } from '@/components/shared/app-shell'
import { Button } from '@/components/ui/button'
import { Brick, type BrickDonation } from '@/components/wall/brick'
import { Wall, WallEmpty } from '@/components/wall/wall'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'

export default function DonorHome() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['donations', 'mine'],
    queryFn: () => api.get<{ donations: BrickDonation[] }>('/donations/mine'),
  })

  const donations = data?.donations ?? []

  return (
    <AppShell
      title={t('donor.title')}
      subtitle={t('donor.subtitle')}
      actions={
        <Button asChild>
          <Link to="/donor/post">{t('action.post')}</Link>
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-muted-foreground">Loading your items.</p>
      ) : isError ? (
        <p role="alert" className="text-destructive">
          {t('error.generic')}
        </p>
      ) : donations.length === 0 ? (
        <WallEmpty message={t('empty.donor')} />
      ) : (
        <Wall>
          {donations.map((donation) => (
            <Brick key={donation.id} donation={donation} showStatus />
          ))}
        </Wall>
      )}
    </AppShell>
  )
}
