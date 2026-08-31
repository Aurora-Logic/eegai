import { describe, expect, it } from 'vitest'
import { GOODS_SPINE, GOODS_FLOW, HEALTH_FLOW, VOLUNTEER_FLOW, flowsFor } from './flows'
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
    const flows = flowsFor('volunteer')
    expect(flows).toHaveLength(1)
    expect(flows[0]?.title).toMatch(/carrying/i)
  })

  it('never opens a journey with a step that person does not do', () => {
    // A volunteer was being shown the donor's flow, so their journey started
    // with "you post it" — something a volunteer never does. Same lane,
    // different person, different words.
    expect(flowsFor('volunteer')[0]?.steps[0]?.label).not.toMatch(/you post it/i)
    expect(VOLUNTEER_FLOW[0]?.label).toMatch(/verifies you/i)
  })

  it('leads with the health lane for a donor', () => {
    expect(flowsFor('donor')[0]?.title).toMatch(/blood/i)
  })
})
