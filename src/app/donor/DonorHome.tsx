import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Droplet } from 'lucide-react'
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
    onSuccess: async () => {
      setNotice('Done — a volunteer nearby can now offer to collect it.')
      await queryClient.invalidateQueries({ queryKey: ['donations'] })
    },
    onError: (error) =>
      setNotice(error instanceof ApiError ? error.message : 'That did not go through. Try again.'),
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

  // One choice may be in flight at a time — the two buttons are alternatives
  // for the same item, so while either request runs, both are disabled
  // everywhere. Only the item actually being worked on changes its label.
  const deliveryBusy = chooseDelivery.isPending || bookCourier.isPending
  const busyId = chooseDelivery.isPending
    ? chooseDelivery.variables?.id
    : bookCourier.isPending
      ? bookCourier.variables
      : null

  const donations = data?.donations ?? []

  return (
    <AppShell
      title={t('donor.title')}
      subtitle={t('donor.subtitle')}
      actions={
        <div className="flex flex-wrap gap-2">
          {/* The other lane. A donor who gives blood and a donor who gives a
              sofa are the same person, so the door is here rather than behind
              a separate account. */}
          <Button asChild variant="outline">
            <Link to="/health">
              <Droplet aria-hidden /> Blood, hair, milk
            </Link>
          </Button>
          <Button asChild>
            <Link to="/donor/post">{t('action.post')}</Link>
          </Button>
        </div>
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
        <WallEmpty
          message={t('empty.donor')}
          action={
            <Button asChild className="min-h-11">
              <Link to="/donor/post">{t('action.post')}</Link>
            </Button>
          }
        />
      ) : (
        <Wall>
          {donations.map((donation) => (
            <Brick
              key={donation.id}
              donation={donation}
              showStatus
              to={`/donor/items/${donation.id}`}
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
                          disabled={deliveryBusy}
                          onClick={() =>
                            chooseDelivery.mutate({ id: donation.id, method: 'volunteer' })
                          }
                        >
                          {chooseDelivery.isPending && busyId === donation.id
                            ? 'Asking…'
                            : 'A volunteer'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11 flex-1 min-[380px]:min-h-9"
                          disabled={deliveryBusy}
                          onClick={() => bookCourier.mutate(donation.id)}
                        >
                          {bookCourier.isPending && busyId === donation.id ? 'Booking…' : 'Courier'}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              }
            />
          ))}
        </Wall>
      )}
    </AppShell>
  )
}
