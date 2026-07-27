import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AppShell } from '@/components/shared/app-shell'
import { HandoverCodes } from '@/components/shared/handover-codes'
import { Button } from '@/components/ui/button'
import { Brick, type BrickDonation } from '@/components/wall/brick'
import { Wall, WallEmpty } from '@/components/wall/wall'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'

export default function DonorHome() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['donations', 'mine'],
    queryFn: () => api.get<{ donations: BrickDonation[] }>('/donations/mine'),
  })

  // Choosing a volunteer opens a pickup; a courier is M5's job.
  const chooseDelivery = useMutation({
    mutationFn: ({ id, method }: { id: string; method: 'volunteer' | 'courier' }) =>
      api.post(`/donations/${id}/delivery`, { method }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
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
      <HandoverCodes />

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
            <Brick
              key={donation.id}
              donation={donation}
              showStatus
              footer={
                donation.status === 'claimed' && !donation.delivery_method ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">How should it get there?</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={chooseDelivery.isPending}
                        onClick={() =>
                          chooseDelivery.mutate({ id: donation.id, method: 'volunteer' })
                        }
                      >
                        A volunteer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled
                        title="Courier booking arrives in M5"
                      >
                        Courier
                      </Button>
                    </div>
                  </div>
                ) : null
              }
            />
          ))}
        </Wall>
      )}
    </AppShell>
  )
}
