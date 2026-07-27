import type { DonationStatus } from './validation/donation'

export type Role = 'donor' | 'ngo' | 'volunteer' | 'admin'

export interface Transition {
  to: DonationStatus
  allowedRoles: Role[]
}

/**
 * The LOCKED state machine from PLAN.md §7.
 *
 * This map is mirrored exactly by app.donation_transitions in
 * db/migrations/008_state_machine.sql. The database copy is the one that
 * actually protects an item — this copy is what lets the UI grey out a button
 * before the user presses it. Change both together or neither.
 */
export const TRANSITIONS: Record<DonationStatus, Transition[]> = {
  posted: [
    { to: 'claimed', allowedRoles: ['ngo', 'admin'] },
    { to: 'cancelled', allowedRoles: ['donor', 'admin'] },
  ],
  claimed: [
    { to: 'scheduled', allowedRoles: ['donor', 'ngo', 'volunteer', 'admin'] },
    // The 24h claim expiry sweep, which runs as the system actor.
    { to: 'posted', allowedRoles: ['admin'] },
    { to: 'cancelled', allowedRoles: ['donor', 'admin'] },
  ],
  scheduled: [
    { to: 'in_transit', allowedRoles: ['donor', 'volunteer', 'admin'] },
    { to: 'claimed', allowedRoles: ['donor', 'ngo', 'volunteer', 'admin'] },
    { to: 'cancelled', allowedRoles: ['donor', 'admin'] },
  ],
  in_transit: [{ to: 'received', allowedRoles: ['ngo', 'admin'] }],
  received: [
    { to: 'acknowledged', allowedRoles: ['ngo', 'admin'] },
    { to: 'rejected', allowedRoles: ['ngo', 'admin'] },
  ],
  acknowledged: [],
  cancelled: [],
  rejected: [],
}

export const TERMINAL_STATUSES: DonationStatus[] = ['acknowledged', 'cancelled', 'rejected']

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: DonationStatus,
    readonly to: DonationStatus,
    readonly role: Role,
    message: string,
  ) {
    super(message)
    this.name = 'IllegalTransitionError'
  }
}

export function isTerminal(status: DonationStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function allowedTransitions(from: DonationStatus, role: Role): DonationStatus[] {
  return TRANSITIONS[from].filter((t) => t.allowedRoles.includes(role)).map((t) => t.to)
}

export function canTransition(from: DonationStatus, to: DonationStatus, role: Role): boolean {
  return TRANSITIONS[from].some((t) => t.to === to && t.allowedRoles.includes(role))
}

/**
 * The single gate every status change goes through (PLAN.md §7). Returns the
 * new status so call sites read as an assignment; throws otherwise.
 *
 * An ESLint rule bans writing `status` through a bare `.update({ ... })`, so
 * bypassing this is a lint error rather than a silent mistake.
 */
export function transition(from: DonationStatus, to: DonationStatus, role: Role): DonationStatus {
  if (from === to) {
    throw new IllegalTransitionError(from, to, role, `The item is already ${from}.`)
  }

  const edge = TRANSITIONS[from].find((t) => t.to === to)

  if (!edge) {
    throw new IllegalTransitionError(
      from,
      to,
      role,
      isTerminal(from)
        ? `This item is ${from} and cannot change again.`
        : `An item cannot go from ${from} to ${to}.`,
    )
  }

  if (!edge.allowedRoles.includes(role)) {
    throw new IllegalTransitionError(
      from,
      to,
      role,
      `A ${role} cannot move an item from ${from} to ${to}.`,
    )
  }

  return to
}
