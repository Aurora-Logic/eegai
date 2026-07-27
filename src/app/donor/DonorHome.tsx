import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { HandoverCodes } from '@/components/shared/handover-codes'
import { Button } from '@/components/ui/button'
import { Brick, type BrickDonation } from '@/components/wall/brick'
import { Wall, WallEmpty } from '@/components/wall/wall'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'

export default function DonorHome() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['donations', 'mine'],
    queryFn: () => api.get<{ donations: BrickDonation[] }>('/donations/mine'),
  })

  const [notice, setNotice] = useState<string | null>(null)

  // Choosing a volunteer opens a pickup for someone to accept.
  const chooseDelivery = useMutation({
    mutationFn: ({ id, method }: { id: string; method: 'volunteer' | 'courier' }) =>
      api.post(`/donations/${id}/delivery`, { method }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
    onError: () => setNotice('That did not go through. Try again.'),
  })

  // Courier books an AWB straight away (M5). Which provider is behind this is a
  // server-side decision — see server/src/lib/courier.ts.
  const bookCourier = useMutation({
    mutationFn: (id: string) => api.post(`/shipments/${id}/book`, {}),
    onSuccess: async () => {
      setNotice('A courier is booked. You will see the tracking on the item.')
      await queryClient.invalidateQueries({ queryKey: ['donations'] })
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError ? error.message : 'The courier could not be booked. Try again.',
      ),
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

      {notice ? (
        <p role="status" className="hairline mb-4 rounded-sm bg-card p-3 text-sm">
          {notice}
        </p>
      ) : null}

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
                <div className="space-y-2">
                  {donation.status === 'claimed' && !donation.delivery_method ? (
                    <>
                      <p className="text-sm text-muted-foreground">How should it get there?</p>
                      {/* Stacked below 380px so neither label wraps mid-word. */}
                      <div className="flex flex-col gap-2 min-[380px]:flex-row">
                        <Button
                          size="sm"
                          className="min-h-11 flex-1 min-[380px]:min-h-9"
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
                          className="min-h-11 flex-1 min-[380px]:min-h-9"
                          disabled={bookCourier.isPending}
                          onClick={() => bookCourier.mutate(donation.id)}
                        >
                          Courier
                        </Button>
                      </div>
                    </>
                  ) : null}

                  {/* Every item gets a way through to its own story, not just
                      the finished ones — "where is it" is the question a donor
                      has most often, and it is unanswerable from a status word. */}
                  <Button asChild variant="ghost" size="sm" className="min-h-11 w-full">
                    <Link to={`/donor/items/${donation.id}`}>
                      {donation.status === 'acknowledged'
                        ? 'See where it got to'
                        : 'Track this item'}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              }
            />
          ))}
        </Wall>
      )}
    </AppShell>
  )
}
