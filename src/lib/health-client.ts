import { api } from '@/lib/api'
import type {
  BloodGroup,
  Gender,
  HealthCategory,
  OfferStatus,
  Urgency,
} from '@/lib/validation/health'

/** The shapes the API returns for the health-donation lane. */

export interface DonorHealthProfile {
  categories: HealthCategory[]
  blood_group: BloodGroup | null
  notify: boolean
  share_location: boolean
  age: number | null
  gender: Gender | null
  /** YYYY-MM-DD, as text so no timezone can move it a day. */
  last_blood_donation: string | null
  available: boolean
  consented_at: string | null
  consent_version: number | null
  consent_withdrawn_at: string | null
}

export interface NearbyRequest {
  id: string
  category: HealthCategory
  blood_group: BloodGroup | null
  urgency: Urgency
  donors_needed: number
  responses_count: number
  pincode: string | null
  note: string | null
  expires_at: string
  created_at: string
  institution: string
  address: string
  /** Null when the donor has not shared an area. */
  distance_km: string | null
  responded: boolean
  /** The donor's own answer: true Available, false Not available, null not yet. */
  my_answer: boolean | null
}

export interface MyResponse {
  response_id: string
  request_id: string
  category: HealthCategory
  blood_group: BloodGroup | null
  urgency: Urgency
  status: string
  institution: string
  contact_person: string | null
  contact_phone: string | null
  address: string
  visit_instructions: string | null
  expires_at: string
  responded_at: string
  withdrawn_at: string | null
  available: boolean
}

export interface OwnRequest {
  id: string
  category: HealthCategory
  blood_group: BloodGroup | null
  urgency: Urgency
  donors_needed: number
  responses_count: number
  not_available_count: number
  radius_km: number
  note: string | null
  status: string
  expires_at: string
  created_at: string
  closed_at: string | null
}

/** Whether this institution may post, and why not if it may not. */
export interface Standing {
  verification_status: string
  health_categories: string[]
  visit_instructions: string | null
  org_type: 'ngo' | 'hospital'
  has_location: boolean
}

export interface Responder {
  profile_id: string
  full_name: string
  phone: string | null
  age: number | null
  gender: Gender | null
  blood_group: BloodGroup | null
  last_blood_donation: string | null
  responded_at: string
}

export interface Partner {
  ngo_id: string
  name: string
  org_type: 'ngo' | 'hospital'
  address: string | null
  pincode: string | null
  visit_instructions: string | null
}

export type OfferCategory = 'hair' | 'breast_milk'

export interface Offer {
  offer_id: string
  category: OfferCategory
  status: OfferStatus
  details: Record<string, unknown>
  photo_path: string | null
  org_note: string | null
  created_at: string
  decided_at: string | null
  organisation: string
  contact_phone: string | null
  address: string | null
  visit_instructions: string | null
}

export interface IncomingOffer extends Offer {
  donor_name: string
  donor_phone: string | null
}

export const healthApi = {
  me: () =>
    api.get<{ profile: DonorHealthProfile | null; consentVersion: number; consented: boolean }>(
      '/needs/me',
    ),
  savePreferences: (body: unknown) => api.put('/needs/me', body),
  consent: () => api.post('/needs/consent'),
  withdrawConsent: () => api.delete('/needs/consent'),

  nearby: () => api.get<{ requests: NearbyRequest[] }>('/needs/requests'),
  respond: (id: string, available: boolean) =>
    api.post<{ available: boolean; institution: Record<string, string> | null }>(
      `/needs/requests/${id}/respond`,
      { available },
    ),
  unrespond: (id: string) => api.delete(`/needs/requests/${id}/respond`),
  myResponses: () => api.get<{ responses: MyResponse[] }>('/needs/responses'),

  postRequest: (body: unknown) =>
    api.post<{ id: string; notified: number }>('/needs/requests', body),
  myRequests: () =>
    api.get<{ requests: OwnRequest[]; standing: Standing | null }>('/needs/requests/mine'),
  responders: (id: string) =>
    api.get<{ responders: Responder[] }>(`/needs/requests/${id}/responders`),
  close: (id: string, status: string) => api.post(`/needs/requests/${id}/close`, { status }),

  partners: (category: OfferCategory) =>
    api.get<{ partners: Partner[] }>(`/needs/partners?category=${category}`),
  submitOffer: (body: unknown) => api.post<{ id: string }>('/needs/offers', body),
  myOffers: () => api.get<{ offers: Offer[] }>('/needs/offers/mine'),
  withdrawOffer: (id: string) => api.post(`/needs/offers/${id}/withdraw`),
  incomingOffers: () => api.get<{ offers: IncomingOffer[] }>('/needs/offers/incoming'),
  decideOffer: (id: string, status: OfferStatus, note?: string) =>
    api.post(`/needs/offers/${id}/decide`, { status, note }),

  deactivate: () => api.post('/needs/account/deactivate'),
  requestDeletion: (reason: string) => api.post('/needs/account/deletion-request', { reason }),
}

export interface ProfilePatch {
  categories?: HealthCategory[]
  bloodGroup?: BloodGroup | null
  notify?: boolean
  shareLocation?: boolean
  age?: number | null
  gender?: Gender | null
  lastBloodDonation?: string | null
  available?: boolean
}

/**
 * The whole registration, with `patch` applied.
 *
 * The save replaces every field, so a screen that sent only what it shows
 * would erase the rest — the preferences screen would wipe a blood donor's
 * age and last donation date. Every caller goes through here instead.
 */
export function profileBody(current: DonorHealthProfile | null | undefined, patch: ProfilePatch) {
  return {
    categories: current?.categories ?? [],
    bloodGroup: current?.blood_group ?? null,
    notify: current?.notify ?? true,
    shareLocation: current?.share_location ?? true,
    age: current?.age ?? null,
    gender: current?.gender ?? null,
    lastBloodDonation: current?.last_blood_donation ?? null,
    available: current?.available ?? true,
    ...patch,
  }
}
