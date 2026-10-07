import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Baby,
  Bell,
  Droplet,
  Package,
  Scissors,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { AppShell } from '@/components/shared/app-shell'
import { GuideCard } from '@/components/shared/guide-card'
import { HomeHero } from '@/components/shared/home-hero'
import { Disclosure } from '@/components/health/disclosure'
import { api } from '@/lib/api'
import { healthApi } from '@/lib/health-client'
import { cn } from '@/lib/utils'

/**
 * The donor's front door: the four donation types from the donor-module spec,
 * in its order — Blood, Hair, Breast Milk, Material.
 *
 * Each type is its own screen because each is a different journey: blood waits
 * for an alert, hair and milk are offered to a partner, material goes on the
 * wall. A single form that tried to be all four would ask every donor
 * questions that only apply to one.
 */
interface DonationType {
  icon: LucideIcon
  label: string
  hint: string
  to: string
  status?: string | undefined
  attention?: boolean
}

/** The spec's key notes, said once, on the screen a donor starts from. */
const KEY_NOTES = [
  'Every hospital and organisation is verified by an admin.',
  'Location is used to match you with who is near.',
  'Your contact details are shared only after you agree.',
  'EEGAI connects you. Screening is done by the organisation.',
]

export default function DonorNeeds() {
  const me = useQuery({ queryKey: ['health', 'me'], queryFn: healthApi.me })
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api.get<{ unread: number }>('/inbox/notifications'),
  })
  const bloodDonor = Boolean(me.data?.profile?.categories.includes('blood'))
  const wall = useQuery({
    queryKey: ['health', 'nearby'],
    queryFn: healthApi.nearby,
    enabled: me.data?.consented === true && bloodDonor,
  })

  const unanswered = (wall.data?.requests ?? []).filter(
    (r) => r.category === 'blood' && r.my_answer === null,
  ).length
  const unread = inbox.data?.unread ?? 0

  const types: DonationType[] = [
    {
      icon: Droplet,
      label: 'Blood',
      hint: 'Register once. Hospitals alert you when they need blood.',
      to: '/health/blood',
      status: !bloodDonor
        ? 'Not registered'
        : unanswered > 0
          ? `${unanswered} ${unanswered === 1 ? 'alert needs' : 'alerts need'} your answer`
          : 'Registered',
      attention: unanswered > 0,
    },
    {
      icon: Scissors,
      label: 'Hair',
      hint: 'For wigs, through a partner organisation.',
      to: '/health/hair',
    },
    {
      icon: Baby,
      label: 'Breast milk',
      hint: 'Through a Lactation Management Centre.',
      to: '/health/milk',
    },
    {
      icon: Package,
      label: 'Material',
      hint: 'Clothes, books and household things. Picked up from your door.',
      to: '/donor',
    },
  ]

  const tiles = [
    {
      icon: Bell,
      label: 'Alerts',
      hint: unread > 0 ? 'Something is waiting for you' : 'Nothing new',
      to: '/inbox',
      count: unread || undefined,
      primary: unread > 0,
    },
    {
      icon: Settings2,
      label: 'Preferences',
      hint: 'Alerts, location and your consent',
      to: '/health/settings',
    },
  ]

  return (
    <AppShell title="What would you like to donate?">
      <HomeHero tiles={tiles} className="mb-6" />

      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Donation types">
        {types.map((type) => (
          <li key={type.to}>
            <Link
              to={type.to}
              className={cn(
                'hairline group flex h-full items-start gap-4 rounded-sm p-4 transition-colors',
                type.attention
                  ? 'border-primary/40 bg-primary/10 hover:bg-primary/15'
                  : 'bg-card hover:bg-foreground/5',
              )}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary">
                <type.icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-display-sm">{type.label}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{type.hint}</span>
                {type.status ? (
                  <span className="mt-2 block font-mono text-xs">{type.status}</span>
                ) : null}
              </span>
              <ArrowRight
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>

      <section className="hairline mt-6 rounded-sm bg-card p-4">
        <h2 className="font-display text-display-sm">Good to know</h2>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {KEY_NOTES.map((note) => (
            <li key={note} className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="text-muted-foreground">{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <GuideCard className="mt-6" />
      <Disclosure className="mt-4" />
    </AppShell>
  )
}
