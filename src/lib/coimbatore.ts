/**
 * Serviceable areas for the pilot. Coimbatore only (PLAN.md §1).
 *
 * A donor typing a pincode from memory gets it wrong often enough to matter,
 * and a wrong pincode puts the item outside every NGO's radius, where it
 * silently expires after 72h. Picking an area from a list removes that failure
 * entirely, and gives us coordinates for the radius maths for free — there is
 * no Google Maps in v1 (§3).
 */
export interface Area {
  pincode: string
  name: string
  lat: number
  lng: number
}

export const COIMBATORE_AREAS: Area[] = [
  { pincode: '641001', name: 'Coimbatore Town Hall', lat: 11.0018, lng: 76.9629 },
  { pincode: '641002', name: 'Coimbatore North', lat: 11.0125, lng: 76.9558 },
  { pincode: '641004', name: 'R.S. Puram', lat: 11.006, lng: 76.949 },
  { pincode: '641005', name: 'Tatabad', lat: 11.0155, lng: 76.9583 },
  { pincode: '641006', name: 'Peelamedu', lat: 11.03, lng: 77.008 },
  { pincode: '641009', name: 'Ganapathy', lat: 11.043, lng: 76.974 },
  { pincode: '641011', name: 'Saibaba Colony', lat: 11.023, lng: 76.945 },
  { pincode: '641012', name: 'Gandhipuram', lat: 11.018, lng: 76.966 },
  { pincode: '641014', name: 'Ramanathapuram', lat: 10.9903, lng: 76.9905 },
  { pincode: '641015', name: 'Kavundampalayam', lat: 11.0405, lng: 76.9345 },
  { pincode: '641018', name: 'Race Course', lat: 10.9975, lng: 76.9705 },
  { pincode: '641025', name: 'Vadavalli', lat: 11.0245, lng: 76.9018 },
  { pincode: '641028', name: 'Singanallur', lat: 11.006, lng: 77.029 },
  { pincode: '641029', name: 'Ondipudur', lat: 10.9895, lng: 77.0395 },
  { pincode: '641035', name: 'Thudiyalur', lat: 11.0725, lng: 76.9385 },
  { pincode: '641038', name: 'Sowripalayam', lat: 11.0005, lng: 76.9995 },
  { pincode: '641041', name: 'Kalapatti', lat: 11.0555, lng: 77.0245 },
  { pincode: '641043', name: 'Chinniampalayam', lat: 11.0135, lng: 77.0365 },
  { pincode: '641045', name: 'Sundarapuram', lat: 10.9575, lng: 76.9825 },
  { pincode: '641062', name: 'Kurichi', lat: 10.9425, lng: 76.9705 },
]

export const AREA_BY_PINCODE = new Map(COIMBATORE_AREAS.map((area) => [area.pincode, area]))

export function areaOptions() {
  return COIMBATORE_AREAS.map((area) => ({
    value: area.pincode,
    label: area.name,
    detail: area.pincode,
  }))
}
