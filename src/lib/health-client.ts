import { api } from '@/lib/api'
import type { BloodGroup, HealthCategory, Urgency } from '@/lib/validation/health'

/** The shapes the API returns for the health-donation lane. */

export interface DonorHealthProfile {
  categories: HealthCategory[]
  blood_group: BloodGroup | null
  notify: boolean
  share_location: boolean
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
  distance_km: string
  responded: boolean
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
}

export interface OwnRequest {
  id: string
  category: HealthCategory
  blood_group: BloodGroup | null
  urgency: Urgency
  donors_needed: number
  responses_count: number
  radius_km: number
  note: string | null
  status: string
  expires_at: string
  created_at: string
  closed_at: string | null
}

export interface Responder {
  profile_id: string
  full_name: string
  phone: string | null
  responded_at: string
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
  respond: (id: string) =>
    api.post<{ institution: Record<string, string> }>(`/needs/requests/${id}/respond`),
  unrespond: (id: string) => api.delete(`/needs/requests/${id}/respond`),
  myResponses: () => api.get<{ responses: MyResponse[] }>('/needs/responses'),

  postRequest: (body: unknown) =>
    api.post<{ id: string; notified: number }>('/needs/requests', body),
  myRequests: () => api.get<{ requests: OwnRequest[] }>('/needs/requests/mine'),
  responders: (id: string) =>
    api.get<{ responders: Responder[] }>(`/needs/requests/${id}/responders`),
  close: (id: string, status: string) => api.post(`/needs/requests/${id}/close`, { status }),

  deactivate: () => api.post('/needs/account/deactivate'),
  requestDeletion: (reason: string) => api.post('/needs/account/deletion-request', { reason }),
}
