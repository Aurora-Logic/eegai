import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, Flag } from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/dates'
import { CATEGORY_LABEL, type HealthCategory } from '@/lib/validation/health'

interface Notification {
  id: string
  template_key: string
  payload: Record<string, unknown>
  created_at: string
  read_at: string | null
  sent_at: string | null
  error: string | null
}

interface Report {
  id: string
  subject_type: string
  detail: string
  status: string
  resolution: string | null
  created_at: string
}

/**
 * Everything the app has told this person, and everything they have told us.
 *
 * Brief §7 lists a Notifications screen. Until this existed the proximity
 * engine wrote alerts nobody could read — a donor learned about a request only
 * by opening the app and looking at the wall.
 *
 * It is not a substitute for a push notification. It is the half that works
 * without a provider, and it is honest about which messages actually went out.
 */
export default function Inbox() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['inbox'],
    queryFn: () =>
      api.get<{ notifications: Notification[]; unread: number }>('/inbox/notifications'),
  })

  const reports = useQuery({
    queryKey: ['inbox', 'reports'],
    queryFn: () => api.get<{ reports: Report[] }>('/inbox/reports'),
  })

  const markRead = useMutation({
    mutationFn: () => api.post('/inbox/notifications/read'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })

  // Opening the screen is the act of reading it. Anything that arrives while it
  // is open stays unread, which is what the `<= now()` in the function is for.
  const unread = data?.unread ?? 0
  useEffect(() => {
    if (unread > 0 && !markRead.isPending) markRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread])

  const notifications = data?.notifications ?? []
  const myReports = reports.data?.reports ?? []

  return (
    <AppShell title="Alerts" subtitle="What we have told you, and what you have told us.">
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          hint="When a verified institution near you needs what you have offered, it turns up here."
        />
      ) : (
        <ul className="space-y-2" aria-label="Alerts">
          {notifications.map((n) => (
            <li key={n.id} className="hairline rounded-sm bg-card p-3">
              <p className="flex flex-wrap items-center gap-2">
                <Bell className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="font-medium">{describe(n)}</span>
                {!n.read_at ? <Badge variant="tag">new</Badge> : null}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {formatRelative(n.created_at)}
                {/* Said plainly rather than hidden: a message that failed to
                    send is the reason somebody did not hear from us. */}
                {n.error ? ' · we could not deliver this to your phone' : ''}
              </p>
              {n.template_key === 'health_request_nearby' ? (
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link to="/health">See what is near you</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {myReports.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 font-display text-display-sm">
            <Flag className="size-4 text-muted-foreground" aria-hidden />
            What you told us
          </h2>
          <ul className="space-y-2">
            {myReports.map((r) => (
              <li key={r.id} className="hairline rounded-sm bg-card p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      r.status === 'resolved' ? 'success' : r.status === 'open' ? 'tag' : 'muted'
                    }
                  >
                    {r.status}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatRelative(r.created_at)}
                  </span>
                </p>
                <p className="mt-1">{r.detail}</p>
                {r.resolution ? (
                  <p className="mt-2 text-muted-foreground">
                    <strong className="text-foreground">What we did:</strong> {r.resolution}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  )
}

/** One line per alert, in the product's own words rather than a template key. */
function describe(n: Notification): string {
  if (n.template_key === 'health_request_nearby') {
    const category = n.payload?.category as HealthCategory | undefined
    const group = n.payload?.blood_group as string | null | undefined
    const what = category ? CATEGORY_LABEL[category] : 'A donation'
    return `${what}${group ? ` (${group})` : ''} needed near you`
  }
  if (n.template_key === 'donation_claimed') return 'An organisation claimed something you posted'
  if (n.template_key === 'item_received') return 'Something you gave has arrived'
  if (n.template_key === 'pickup_scheduled') return 'A collection has been arranged'
  return n.template_key.replace(/_/g, ' ')
}
