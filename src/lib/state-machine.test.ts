import { describe, expect, it } from 'vitest'
import { DONATION_STATUSES, type DonationStatus } from './validation/donation'
import {
  IllegalTransitionError,
  TRANSITIONS,
  allowedTransitions,
  canTransition,
  isTerminal,
  transition,
  type Role,
} from './state-machine'

const ROLES: Role[] = ['donor', 'ngo', 'volunteer', 'admin']

/**
 * PLAN.md §7: "Unit-test every legal and illegal edge." Rather than listing the
 * legal ones by hand and hoping the list stays in step, the suite walks the
 * full status x status x role space and asserts that exactly the edges declared
 * in TRANSITIONS are permitted.
 */
describe('the transition map', () => {
  it('covers every status', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...DONATION_STATUSES].sort())
  })

  it('never declares a transition to a status that does not exist', () => {
    for (const edges of Object.values(TRANSITIONS)) {
      for (const edge of edges) {
        expect(DONATION_STATUSES).toContain(edge.to)
      }
    }
  })

  it('leaves the three terminal states with no way out', () => {
    expect(TRANSITIONS.acknowledged).toEqual([])
    expect(TRANSITIONS.cancelled).toEqual([])
    expect(TRANSITIONS.rejected).toEqual([])
    for (const status of ['acknowledged', 'cancelled', 'rejected'] as const) {
      expect(isTerminal(status)).toBe(true)
    }
  })

  it('never allows an empty role list, which would be an unreachable edge', () => {
    for (const edges of Object.values(TRANSITIONS)) {
      for (const edge of edges) {
        expect(edge.allowedRoles.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('every edge in the space', () => {
  const cases: Array<[DonationStatus, DonationStatus, Role, boolean]> = []

  for (const from of DONATION_STATUSES) {
    for (const to of DONATION_STATUSES) {
      for (const role of ROLES) {
        const declared = TRANSITIONS[from].find((t) => t.to === to)
        const legal = from !== to && !!declared && declared.allowedRoles.includes(role)
        cases.push([from, to, role, legal])
      }
    }
  }

  it.each(cases)('%s -> %s as %s', (from, to, role, legal) => {
    expect(canTransition(from, to, role)).toBe(legal && from !== to)

    if (legal) {
      expect(transition(from, to, role)).toBe(to)
    } else {
      expect(() => transition(from, to, role)).toThrow(IllegalTransitionError)
    }
  })
})

describe('the specific rules PLAN.md §7 calls out', () => {
  it('lets only an NGO claim a posted item', () => {
    expect(canTransition('posted', 'claimed', 'ngo')).toBe(true)
    expect(canTransition('posted', 'claimed', 'donor')).toBe(false)
    expect(canTransition('posted', 'claimed', 'volunteer')).toBe(false)
  })

  it('lets a donor cancel at any point before the item is moving', () => {
    for (const from of ['posted', 'claimed', 'scheduled'] as const) {
      expect(canTransition(from, 'cancelled', 'donor')).toBe(true)
    }
  })

  it('stops a donor cancelling once the item is in transit or beyond', () => {
    for (const from of ['in_transit', 'received', 'acknowledged'] as const) {
      expect(canTransition(from, 'cancelled', 'donor')).toBe(false)
    }
  })

  it('lets only an NGO reject, and only on arrival', () => {
    expect(canTransition('received', 'rejected', 'ngo')).toBe(true)
    expect(canTransition('received', 'rejected', 'donor')).toBe(false)
    expect(canTransition('received', 'rejected', 'volunteer')).toBe(false)
    expect(canTransition('in_transit', 'rejected', 'ngo')).toBe(false)
  })

  it('sends an expired claim back to the wall as a system action only', () => {
    expect(canTransition('claimed', 'posted', 'admin')).toBe(true)
    expect(canTransition('claimed', 'posted', 'ngo')).toBe(false)
    expect(canTransition('claimed', 'posted', 'donor')).toBe(false)
  })

  it('drops a cancelled pickup back to claimed, not to posted', () => {
    expect(canTransition('scheduled', 'claimed', 'volunteer')).toBe(true)
    expect(canTransition('scheduled', 'posted', 'volunteer')).toBe(false)
  })
})

describe('error messages', () => {
  it('explains that a terminal item cannot change', () => {
    expect(() => transition('acknowledged', 'received', 'admin')).toThrow(/cannot change again/)
  })

  it('explains a role failure differently from a missing edge', () => {
    expect(() => transition('posted', 'claimed', 'donor')).toThrow(/A donor cannot move an item/)
    expect(() => transition('posted', 'received', 'admin')).toThrow(/cannot go from posted/)
  })

  it('refuses a no-op', () => {
    expect(() => transition('posted', 'posted', 'admin')).toThrow(/already posted/)
  })
})

describe('allowedTransitions', () => {
  it('gives an NGO exactly one move from a posted item', () => {
    expect(allowedTransitions('posted', 'ngo')).toEqual(['claimed'])
  })

  it('gives nobody a move out of a terminal state', () => {
    for (const role of ROLES) {
      expect(allowedTransitions('cancelled', role)).toEqual([])
    }
  })
})
