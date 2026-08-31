import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Droplet } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { GuideCard } from '@/components/shared/guide-card'
import { HandoverCodes } from '@/components/shared/handover-codes'
import { Button } from '@/components/ui/button'
import { Brick, type BrickDonation } from '@/components/wall/brick'
import { Wall, WallEmpty } from '@/components/wall/wall'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'

type Tab = 'wall' | 'claimed'

export default function NgoWall() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('wall')
  // Ids mid-animation. The brick stays mounted until its lift-off finishes,
  // then the query refetch removes it for real.
  const [lifting, setLifting] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)

  const wall = useQuery({
    queryKey: ['donations', 'wall'],
    queryFn: () => api.get<{ donations: BrickDonation[] }>('/donations/wall'),
  })

  const claimed = useQuery({
    queryKey: ['donations', 'claimed'],
    queryFn: () => api.get<{ donations: BrickDonation[] }>('/donations/claimed'),
    enabled: tab === 'claimed',
  })

  const claim = useMutation({
    mutationFn: (id: string) => api.post(`/donations/${id}/claim`),
    onMutate: (id) => {
      setNotice(null)
      setLifting((current) => new Set(current).add(id))
    },
    onSuccess: async () => {
      setNotice(t('toast.claimed'))
      // Let the lift-off play out before the list changes underneath it.
      await new Promise((resolve) => setTimeout(resolve, 380))
      await queryClient.invalidateQueries({ queryKey: ['donations'] })
      setLifting(new Set())
    },
    onError: (error, id) => {
      setLifting((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      // 409 means another NGO won the race. That is a normal outcome, not a
      // failure, so it reads as information rather than an error.
      setNotice(
        error instanceof ApiError && error.status === 409
          ? 'Already claimed by another organisation.'
          : 'That did not go through. Try again.',
      )
      void queryClient.invalidateQueries({ queryKey: ['donations', 'wall'] })
    },
  })

  const active = tab === 'wall' ? wall : claimed
  const donations = active.data?.donations ?? []

  return (
    <AppShell
      title={tab === 'wall' ? t('ngo.wallTitle') : t('ngo.claimsTitle')}
      subtitle={tab === 'wall' ? t('ngo.wallSubtitle') : undefined}
      actions={
        <div className="flex flex-wrap gap-2">
          {/* Only shown to an organisation an admin has approved for a health
              category — the others have nothing to post and the screen would
              refuse them. */}
          <Button asChild variant="outline">
            <Link to="/ngo/needs">
              <Droplet aria-hidden /> Donation requests
            </Link>
          </Button>
          <Button variant={tab === 'wall' ? 'default' : 'outline'} onClick={() => setTab('wall')}>
            {t('ngo.tabWall')}
          </Button>
          <Button
            variant={tab === 'claimed' ? 'default' : 'outline'}
            onClick={() => setTab('claimed')}
          >
            {t('ngo.tabClaims')}
          </Button>
        </div>
      }
    >
      {/* The NGO's deliver code lives here too — same RLS-scoped source. */}
      <HandoverCodes />

      {notice ? (
        <p role="status" className="hairline mb-4 rounded-sm bg-card p-3 text-sm">
          {notice}
        </p>
      ) : null}

      {active.isLoading ? (
        <p className="text-muted-foreground">Loading the wall.</p>
      ) : active.isError ? (
        <p role="alert" className="text-destructive">
          {t('error.generic')}
        </p>
      ) : donations.length === 0 ? (
        <WallEmpty
          message={tab === 'wall' ? t('empty.wall') : t('empty.claims')}
          {...(tab === 'claimed'
            ? {
                action: (
                  <Button className="min-h-11" onClick={() => setTab('wall')}>
                    {t('ngo.tabWall')}
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <Wall>
          {donations.map((donation) => (
            <Brick
              key={donation.id}
              donation={donation}
              showStatus={tab === 'claimed'}
              lifting={lifting.has(donation.id)}
              to={`/ngo/items/${donation.id}`}
              footer={
                tab === 'claimed' && donation.status === 'received' ? (
                  // The one action that matters on this tab. It only appears once
                  // the goods are actually here, so an NGO cannot acknowledge an
                  // item that is still in a volunteer's bag.
                  <Button asChild size="sm" className="min-h-11 w-full">
                    <Link to={`/ngo/items/${donation.id}`}>Confirm what arrived</Link>
                  </Button>
                ) : null
              }
              {...(tab === 'wall'
                ? {
                    onClaim: (id: string) => claim.mutate(id),
                    isClaiming: lifting.has(donation.id),
                  }
                : {})}
            />
          ))}
        </Wall>
      )}
      <GuideCard className="mt-6" />
    </AppShell>
  )
}
