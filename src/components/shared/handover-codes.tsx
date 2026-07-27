import { useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

interface Notification {
  id: string
  template_key: string
  payload: { donation_id?: string; title?: string; code?: string }
  created_at: string
}

const LABEL: Record<string, string> = {
  collect_otp: 'Read this to the volunteer when they collect',
  deliver_otp: 'Read this to the volunteer when they deliver',
}

/**
 * Shows the handover codes belonging to whoever is signed in.
 *
 * This is the delivery channel until SMS lands in M8, and it is safe by
 * construction: the notifications RLS policy only returns rows whose
 * profile_id is the reader's, so nobody can see a code meant for someone else.
 * The volunteer never has a screen that shows one — they are told it out loud.
 */
export function HandoverCodes() {
  const { data } = useQuery({
    queryKey: ['notifications', 'mine'],
    queryFn: () => api.get<{ notifications: Notification[] }>('/pickups/notifications'),
    refetchInterval: 30_000,
  })

  const codes = (data?.notifications ?? []).filter((n) => n.payload?.code)
  if (codes.length === 0) return null

  return (
    <section className="hairline mb-6 rounded-sm bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-display-sm">
        <KeyRound className="size-4" aria-hidden /> Handover codes
      </h2>
      <ul className="mt-3 space-y-3">
        {codes.map((note) => (
          <li key={note.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{note.payload.title ?? 'Your item'}</span>
              <span className="block text-sm text-muted-foreground">
                {LABEL[note.template_key] ?? 'Handover code'}
              </span>
            </span>
            <Badge className="font-mono text-lg tracking-[0.3em]">{note.payload.code}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Say it out loud. Never send it by message, and never let anyone type it into your phone.
      </p>
    </section>
  )
}
