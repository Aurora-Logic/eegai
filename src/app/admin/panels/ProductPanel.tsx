import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GUIDE } from '@/lib/guide'
import { TRANSITIONS, type Role } from '@/lib/state-machine'
import { DONATION_STATUSES, type DonationStatus } from '@/lib/validation/donation'
import { cn } from '@/lib/utils'

/**
 * What the product does, and how an item actually moves.
 *
 * For a team that has to explain this to an organisation on the phone. The flow
 * half is rendered from TRANSITIONS — the same map the state machine and the
 * database trigger enforce — rather than from a hand-written diagram, so it
 * cannot quietly stop being true. A wall chart drifts the first time somebody
 * adds an edge; this cannot.
 *
 * The feature half reads from GUIDE, which is also what the manual and the
 * first-run tour render. One description of the product, three places it
 * appears.
 */
const STATUS_COPY: Record<DonationStatus, string> = {
  posted: 'On the wall. Visible to nearby organisations in matching categories.',
  claimed:
    'An organisation has asked for it. Invisible to everyone else. 48h to arrange collection.',
  scheduled: 'A volunteer took a slot, or a courier has an AWB.',
  in_transit: 'Collected. The donor read their code out.',
  received: 'At the organisation. The delivery code was read out.',
  acknowledged: 'Confirmed with a photo and a note. The donor can download a record.',
  rejected: 'Sent back with a written reason and a photo. Both shown to the donor.',
  cancelled: 'Taken off the wall. Nothing is deleted; the trail stays.',
}

const ROLE_LABEL: Record<Role, string> = {
  donor: 'Donor',
  ngo: 'Organisation',
  volunteer: 'Volunteer',
  admin: 'Admin',
}

const TERMINAL = new Set<DonationStatus>(['acknowledged', 'rejected', 'cancelled'])

export function ProductPanel() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-display-sm">How an item moves</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          Read from the same map the database enforces, so it cannot go out of date. Anything not
          listed here is refused by a trigger, not merely hidden by a button.
        </p>

        <ol className="mt-4 space-y-3">
          {DONATION_STATUSES.map((status) => {
            const edges = TRANSITIONS[status]
            return (
              <li key={status} className="hairline rounded-sm bg-card p-4">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={TERMINAL.has(status) ? 'muted' : 'tag'}>
                    {status.replace('_', ' ')}
                  </Badge>
                  {TERMINAL.has(status) ? (
                    <span className="text-xs text-muted-foreground">
                      final — cannot change again
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{STATUS_COPY[status]}</p>

                {edges.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {edges.map((edge) => (
                      <li key={edge.to} className="flex flex-wrap items-center gap-2 text-sm">
                        <ArrowRight
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <Badge variant="outline">{edge.to.replace('_', ' ')}</Badge>
                        <span className="text-muted-foreground">
                          by {edge.allowedRoles.map((r) => ROLE_LABEL[r]).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ol>
      </div>

      <div>
        <h2 className="font-display text-display-sm">What each role can do</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          The same words the in-app manual shows them, so support and product cannot describe it
          differently.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(Object.keys(GUIDE) as Role[]).map((role) => (
            <div key={role} className="hairline rounded-sm bg-card p-4">
              <h3 className="font-medium">{ROLE_LABEL[role]}</h3>
              <ol className="mt-2 space-y-2">
                {GUIDE[role].map((step, index) => (
                  <li key={step.title} className="flex gap-2 text-sm">
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full',
                        'bg-primary/15 font-mono text-xs text-primary',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{step.title}</span>
                      <span className="block text-muted-foreground">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-display text-display-sm">Rules worth knowing on a call</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {[
            [
              'First claim wins',
              'Two organisations tapping at once: exactly one gets it, enforced by a row lock.',
            ],
            [
              'Capacity is enforced',
              'An organisation cannot claim past its monthly limit. An admin raises it.',
            ],
            ['Claims expire', 'Unarranged after 48h, an item goes back on the wall automatically.'],
            [
              'Codes are spoken',
              'Nobody can read a code meant for someone else, and a volunteer never sees one.',
            ],
            [
              'Nothing is deleted',
              'Removing an item cancels it. Disabling an account stops sign-in. The trail survives both.',
            ],
            [
              'Two lanes, one login',
              'Blood, hair and breast milk are a coordination layer — the donation happens at the institution and this app never touches it. Clothes and books are the wall, where a volunteer moves things. Nothing crosses between them.',
            ],
            [
              'A donor location never reaches an institution',
              'Matching happens inside the database and returns a count. An institution gets a name and a phone number when somebody says yes, and nothing else — the schema cannot give it a location.',
            ],
            [
              'Only approved institutions can ask',
              'An admin grants blood, hair or milk per organisation from the Organisations tab. Nobody can grant it to themselves.',
            ],
            [
              'No medical judgements anywhere',
              'Blood groups filter alerts so an O- request does not page every A+ donor. Whether somebody can actually donate is decided at the institution, in person.',
            ],
            [
              'Roles are asked for, never taken',
              'Anyone can request a different role from their own profile; an admin grants it, and admin is never askable.',
            ],
            ['No money', 'There is no payment anywhere in the product.'],
          ].map(([title, body]) => (
            <li key={title} className="hairline rounded-sm bg-card p-3">
              <span className="font-medium">{title}.</span>{' '}
              <span className="text-muted-foreground">{body}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
