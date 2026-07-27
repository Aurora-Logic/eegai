import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { HandoverScene } from '@/components/illustrations/journey'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

interface Notification {
  id: string
  template_key: string
  payload: { donation_id?: string; title?: string; code?: string }
  created_at: string
}

const LABEL: Record<string, { who: string; when: string }> = {
  collect_otp: {
    who: 'Read this to the volunteer',
    when: 'when they arrive to collect it',
  },
  deliver_otp: {
    who: 'Read this to the volunteer',
    when: 'when they hand the items over',
  },
}

/**
 * The handover codes belonging to whoever is signed in.
 *
 * **This is the OTP channel, not a placeholder for one.** An SMS gateway costs
 * money per message, needs a DLT template registration in India, and adds a
 * delivery failure mode between a volunteer standing at a door and the code that
 * lets them leave with someone's belongings. Showing the code in the app has
 * none of those problems and is strictly more reliable: the person who needs it
 * is already signed in and already looking at their phone.
 *
 * It is safe by construction rather than by convention. The notifications RLS
 * policy returns only rows whose profile_id is the reader's, so the query cannot
 * return a code meant for someone else even if this component asked for one. The
 * volunteer has no screen that shows a code at all — they are told it out loud,
 * which is what makes it evidence of presence rather than evidence of a login.
 *
 * SMS is still worth adding later for the case this cannot cover: a donor who
 * has the app closed and no data. That is a delivery *fallback* in M8, not a
 * replacement for this.
 */
export function HandoverCodes() {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const { data } = useQuery({
    queryKey: ['notifications', 'mine'],
    queryFn: () => api.get<{ notifications: Notification[] }>('/pickups/notifications'),
    refetchInterval: 30_000,
  })

  const codes = (data?.notifications ?? []).filter((n) => n.payload?.code)
  if (codes.length === 0) return null

  function toggle(id: string) {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="hairline mb-6 overflow-hidden rounded-sm bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <KeyRound className="size-4 text-primary" aria-hidden />
        <h2 className="font-display text-display-sm">
          {codes.length === 1 ? 'Your handover code' : 'Your handover codes'}
        </h2>
      </div>

      <HandoverScene className="mx-auto w-full max-w-xs text-foreground" />

      <ul className="divide-y divide-border border-t border-border">
        {codes.map((note) => {
          const label = LABEL[note.template_key]
          const isRevealed = revealed.has(note.id)

          return (
            <li key={note.id} className="p-4">
              <p className="font-medium">{note.payload.title ?? 'Your item'}</p>
              <p className="text-sm text-muted-foreground">
                {label ? `${label.who} ${label.when}.` : 'Handover code.'}
              </p>

              {/* Stacked on a phone so the code gets the full width it needs to
                  be readable at arm's length; inline once there is room. */}
              <div className="mt-3 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center">
                <output
                  className="hairline flex-1 rounded-sm bg-background py-3 text-center font-mono text-3xl tracking-[0.4em]"
                  aria-label={
                    isRevealed
                      ? `Your code is ${note.payload.code?.split('').join(' ')}`
                      : 'Code hidden'
                  }
                >
                  {isRevealed ? note.payload.code : '••••'}
                </output>

                {/* Hidden by default so the code is not sitting face-up on a
                    screen in a crowded street. One tap is not friction worth
                    saving here. */}
                <Button
                  variant="outline"
                  className="min-h-11 min-[420px]:w-32"
                  onClick={() => toggle(note.id)}
                >
                  {isRevealed ? (
                    <>
                      <EyeOff aria-hidden /> Hide
                    </>
                  ) : (
                    <>
                      <Eye aria-hidden /> Show
                    </>
                  )}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Say it out loud. Never send it in a message, and never let anyone type it into your own
        phone — reading it aloud is the whole point.
      </p>
    </section>
  )
}
