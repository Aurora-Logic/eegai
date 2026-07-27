/**
 * M5 — the courier adapter (PLAN.md §9 M5).
 *
 * The point of this file is that `shipments.ts` never names a courier. Swapping
 * Shiprocket for Delhivery is adding one object below and changing one env var;
 * no route, no component, and no test touches a provider name.
 *
 * **No real provider is wired yet, and that is deliberate.** PLAN.md §11 Q3 —
 * which courier has sandbox API access — is unanswered, and an adapter written
 * against API docs I cannot execute is not an integration, it is a guess with a
 * plausible shape. The mock below is complete and the acceptance criterion for
 * M5 is explicitly "the whole flow works against the mock provider with no
 * network", so the milestone stands on its own. When §11 lands, implement
 * `CourierProvider` once and register it.
 */

/** Where a shipment is, in our words rather than any provider's. */
export type ShipmentStatus =
  | 'created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'cancelled'

export interface Address {
  name: string
  phone: string
  line: string
  pincode: string
  city: string
}

export interface BookingRequest {
  donationId: string
  pickup: Address
  drop: Address
  /** Grams. Couriers price on this, so it is required rather than optional. */
  weightGrams: number
  description: string
}

export interface Booking {
  awbNumber: string
  labelUrl: string | null
  /** Paise, never rupees — money in this codebase is always an integer. */
  feePaise: number
  status: ShipmentStatus
}

export interface TrackingUpdate {
  status: ShipmentStatus
  /** The provider's own string, kept verbatim for support conversations. */
  providerStatus: string
  updatedAt: string
}

export interface CourierProvider {
  readonly name: string
  book(request: BookingRequest): Promise<Booking>
  track(awbNumber: string): Promise<TrackingUpdate>
  cancel(awbNumber: string): Promise<void>
}

export class CourierError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'CourierError'
  }
}

/**
 * How a courier's progress maps onto our own state machine (PLAN.md §7).
 *
 * Only two provider states move a donation. Everything between pickup and
 * delivery is the same `in_transit` to us, because the donor does not need six
 * words for "it is on a van" and the state machine has no edges for them.
 *
 * `exception` deliberately maps to nothing. A failed delivery must not silently
 * move an item — it needs a human, and returning null is what makes that visible
 * rather than guessed at.
 */
export function donationStatusFor(status: ShipmentStatus): 'in_transit' | 'received' | null {
  switch (status) {
    case 'picked_up':
    case 'in_transit':
    case 'out_for_delivery':
      return 'in_transit'
    case 'delivered':
      return 'received'
    default:
      return null
  }
}

/**
 * The mock. Deterministic, offline, and the only provider the tests ever see.
 *
 * Progress is derived from how long ago the AWB was booked rather than held in
 * memory, so it survives a process restart and behaves the same on the tenth
 * poll as the first. The AWB encodes its own booking time for exactly that
 * reason — there is no store to get out of sync with.
 */
export class MockCourier implements CourierProvider {
  readonly name = 'mock'

  /** Minutes after booking at which each stage is reached. */
  private static readonly SCHEDULE: [number, ShipmentStatus][] = [
    [0, 'created'],
    [1, 'picked_up'],
    [3, 'in_transit'],
    [6, 'out_for_delivery'],
    [9, 'delivered'],
  ]

  async book(request: BookingRequest): Promise<Booking> {
    if (!/^[1-9][0-9]{5}$/.test(request.drop.pincode)) {
      throw new CourierError('That destination pincode is not serviceable.', this.name, false)
    }

    // base 40 rupees, then 20 per extra half kilo — a plausible shape, not a quote
    const feePaise = 4000 + Math.max(0, Math.ceil(request.weightGrams / 500) - 1) * 2000
    const awbNumber = `MOCK${Date.now().toString(36).toUpperCase()}`

    return {
      awbNumber,
      labelUrl: `/api/shipments/${awbNumber}/label`,
      feePaise,
      status: 'created',
    }
  }

  async track(awbNumber: string): Promise<TrackingUpdate> {
    const bookedAt = MockCourier.bookedAtFrom(awbNumber)
    if (bookedAt === null) {
      throw new CourierError(`Unknown AWB ${awbNumber}.`, this.name, false)
    }

    const elapsedMinutes = (Date.now() - bookedAt) / 60_000
    let status: ShipmentStatus = 'created'
    for (const [minutes, stage] of MockCourier.SCHEDULE) {
      if (elapsedMinutes >= minutes) status = stage
    }

    return {
      status,
      providerStatus: `MOCK_${status.toUpperCase()}`,
      updatedAt: new Date().toISOString(),
    }
  }

  async cancel(awbNumber: string): Promise<void> {
    if (MockCourier.bookedAtFrom(awbNumber) === null) {
      throw new CourierError(`Unknown AWB ${awbNumber}.`, this.name, false)
    }
  }

  private static bookedAtFrom(awbNumber: string): number | null {
    if (!awbNumber.startsWith('MOCK')) return null
    const parsed = Number.parseInt(awbNumber.slice(4), 36)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
}

const PROVIDERS = new Map<string, CourierProvider>([['mock', new MockCourier()]])

/**
 * Resolves the configured provider.
 *
 * Defaults to the mock rather than throwing, so a developer who has never set
 * COURIER_PROVIDER gets a working courier flow instead of a 500. The moment a
 * real provider exists this should refuse to start in production with the mock
 * selected — that check belongs here, and is a one-liner once there is something
 * to fall back to.
 */
export function courier(): CourierProvider {
  const name = process.env.COURIER_PROVIDER ?? 'mock'
  const provider = PROVIDERS.get(name)
  if (!provider) {
    throw new CourierError(`No courier adapter registered as "${name}".`, name, false)
  }
  return provider
}
