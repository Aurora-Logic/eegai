import { describe, expect, it } from 'vitest'
import { GOODS_SPINE, HEALTH_FLOW, GOODS_FLOW, flowsFor } from './flows'
import { TRANSITIONS } from './state-machine'

describe('the diagram in the manual', () => {
  it('draws only arrows the state machine actually allows', () => {
    // The whole reason the spine is a constant rather than prose: a diagram
    // that quietly stops matching the product is worse than no diagram.
    for (const [from, to] of GOODS_SPINE.slice(0, -1).map(
      (from, i) => [from, GOODS_SPINE[i + 1]!] as const,
    )) {
      const legal = TRANSITIONS[from].map((t) => t.to)
      expect(legal, `${from} → ${to} is not a legal transition`).toContain(to)
    }
  })

  it('has one drawn step per state on the goods spine', () => {
    expect(GOODS_FLOW).toHaveLength(GOODS_SPINE.length)
  })

  it('ends both health journeys outside the app', () => {
    // Brief §6: the donation itself is the institution's, never ours. If the
    // last step ever stops saying so, the diagram is claiming something the
    // product must not claim.
    for (const steps of [HEALTH_FLOW.donor, HEALTH_FLOW.ngo]) {
      expect(steps.at(-1)?.handoff).toBe(true)
    }
  })

  it('gives a volunteer only the lane they are part of', () => {
    const titles = flowsFor('volunteer').map((f) => f.title)
    expect(titles).toHaveLength(1)
    expect(titles[0]).toMatch(/carrying/i)
  })

  it('leads with the health lane for a donor', () => {
    expect(flowsFor('donor')[0]?.title).toMatch(/blood/i)
  })
})
