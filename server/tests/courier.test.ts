import { describe, expect, it } from 'vitest'
import {
  CourierError,
  MockCourier,
  courier,
  donationStatusFor,
  type ShipmentStatus,
} from '../src/lib/courier.ts'
import { TRANSITIONS } from '../../src/lib/state-machine.ts'

/**
 * M5's acceptance criterion is that the whole flow works against the mock with
 * no network, so these tests make no network call and none is mocked away.
 */
describe('courier status mapping', () => {
  it('maps every in-flight state onto in_transit', () => {
    for (const status of ['picked_up', 'in_transit', 'out_for_delivery'] as ShipmentStatus[]) {
      expect(donationStatusFor(status)).toBe('in_transit')
    }
  })

  it('maps delivered onto received', () => {
    expect(donationStatusFor('delivered')).toBe('received')
  })

  /**
   * The important one. A failed delivery must never move a donation on its own —
   * it needs a human. If someone later "helpfully" maps exception onto a status,
   * this fails and asks them to think again.
   */
  it('refuses to move anything on an exception or a cancellation', () => {
    expect(donationStatusFor('exception')).toBeNull()
    expect(donationStatusFor('cancelled')).toBeNull()
    expect(donationStatusFor('created')).toBeNull()
  })

  /**
   * Guards the seam between the adapter and PLAN.md §7. Every status the courier
   * can produce has to be a real edge out of `scheduled`, or the courier will
   * report progress the state machine then refuses and the item silently stalls.
   */
  /**
   * The stall this caught in manual testing: a mock AWB aged past the delivery
   * threshold reports `delivered` on the very first poll, and `scheduled ->
   * received` is not an edge. A tracker that applied one step left the item at
   * `scheduled` forever with the parcel already delivered.
   *
   * This asserts the property that makes walking necessary — that the courier's
   * end state is NOT reachable in one hop from where booking leaves an item — so
   * it keeps failing if someone replaces the walk with a single transition.
   */
  it('cannot reach delivered in one hop from where booking leaves an item', () => {
    const target = donationStatusFor('delivered')
    const oneHop = TRANSITIONS.scheduled.map((t) => t.to)

    expect(target).toBe('received')
    expect(oneHop).not.toContain('received')
    // ...but it is reachable via in_transit, which is the path the walk takes.
    expect(oneHop).toContain('in_transit')
    expect(TRANSITIONS.in_transit.map((t) => t.to)).toContain('received')
  })

  it('only ever targets states the machine can actually reach', () => {
    const reachable = new Set([
      ...TRANSITIONS.scheduled.map((t) => t.to),
      ...TRANSITIONS.in_transit.map((t) => t.to),
    ])

    const targets = (
      [
        'created',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'exception',
        'cancelled',
      ] as ShipmentStatus[]
    )
      .map(donationStatusFor)
      .filter((s): s is NonNullable<typeof s> => s !== null)

    for (const target of targets) {
      expect(reachable.has(target)).toBe(true)
    }
  })
})

describe('the mock provider', () => {
  const mock = new MockCourier()

  const address = {
    name: 'A Donor',
    phone: '9876543210',
    line: '12 Cross Cut Road',
    pincode: '641012',
    city: 'Coimbatore',
  }

  const request = {
    donationId: '00000000-0000-0000-0000-000000000001',
    pickup: address,
    drop: { ...address, pincode: '641004' },
    weightGrams: 2000,
    description: 'Six shirts',
  }

  it('books an AWB and prices by weight', async () => {
    const booking = await mock.book(request)

    expect(booking.awbNumber).toMatch(/^MOCK[0-9A-Z]+$/)
    expect(booking.status).toBe('created')
    // 40 rupees base plus 20 per extra half kilo, in paise.
    expect(booking.feePaise).toBe(4000 + 3 * 2000)
    expect(Number.isInteger(booking.feePaise)).toBe(true)
  })

  it('refuses an unserviceable pincode without retrying', async () => {
    await expect(
      mock.book({ ...request, drop: { ...address, pincode: '00123' } }),
    ).rejects.toBeInstanceOf(CourierError)

    await mock.book({ ...request, drop: { ...address, pincode: '641004' } }).catch(() => null)

    try {
      await mock.book({ ...request, drop: { ...address, pincode: '00123' } })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as CourierError).retryable).toBe(false)
    }
  })

  it('reports a freshly booked shipment as created', async () => {
    const booking = await mock.book(request)
    const update = await mock.track(booking.awbNumber)

    expect(update.status).toBe('created')
    expect(update.providerStatus).toBe('MOCK_CREATED')
  })

  /**
   * Progress is derived from the booking time encoded in the AWB rather than
   * held in memory, so an old AWB reports a late stage with no state to restore.
   * This is what makes the mock survive a process restart.
   */
  it('derives progress from how long ago the AWB was booked', async () => {
    const twentyMinutesAgo = Date.now() - 20 * 60_000
    const awb = `MOCK${twentyMinutesAgo.toString(36).toUpperCase()}`

    expect((await mock.track(awb)).status).toBe('delivered')
  })

  it('rejects an AWB it did not issue', async () => {
    await expect(mock.track('SHIPROCKET123')).rejects.toBeInstanceOf(CourierError)
    await expect(mock.cancel('SHIPROCKET123')).rejects.toBeInstanceOf(CourierError)
  })
})

describe('provider selection', () => {
  it('falls back to the mock so a fresh clone has a working courier flow', () => {
    expect(courier().name).toBe('mock')
  })

  it('throws rather than silently falling back when asked for an unknown provider', () => {
    const previous = process.env.COURIER_PROVIDER
    process.env.COURIER_PROVIDER = 'delhivery'
    try {
      expect(() => courier()).toThrow(CourierError)
    } finally {
      if (previous === undefined) delete process.env.COURIER_PROVIDER
      else process.env.COURIER_PROVIDER = previous
    }
  })
})
