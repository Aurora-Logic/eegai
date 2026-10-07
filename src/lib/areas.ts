/**
 * Serviceable areas: Coimbatore, Tiruppur and Mettupalayam.
 *
 * A donor typing a pincode from memory gets it wrong often enough to matter,
 * and a wrong pincode puts the item outside every organisation's radius, where
 * it silently expires. Picking an area from a list removes that failure and
 * gives us coordinates for the distance maths for free — there is no Google
 * Maps here.
 *
 * The list is a curated starting set, not an authoritative postal file, and the
 * coordinates are approximate area centres used only for "how far away is
 * this". Nothing here is a postal address: the exact street address is typed
 * per item or per organisation. Correcting or extending an entry is a one-line
 * edit, and anything missing is still reachable through `areaFor`, which
 * accepts any valid pincode and falls back to the nearest town centre — so
 * somebody in an unlisted village is never locked out of signing up.
 */
export type Town = 'Coimbatore' | 'Tiruppur' | 'Mettupalayam'

export interface Area {
  pincode: string
  name: string
  town: Town
  lat: number
  lng: number
}

/** Where a pincode lands when it is not one of the listed areas. */
const TOWN_CENTRE: Record<Town, { lat: number; lng: number }> = {
  Coimbatore: { lat: 11.0168, lng: 76.9558 },
  Tiruppur: { lat: 11.1085, lng: 77.3411 },
  Mettupalayam: { lat: 11.2995, lng: 76.9365 },
}

export const AREAS: Area[] = [
  // ---- Coimbatore city ----
  {
    pincode: '641001',
    name: 'Coimbatore Town Hall',
    town: 'Coimbatore',
    lat: 11.0018,
    lng: 76.9629,
  },
  { pincode: '641002', name: 'Coimbatore North', town: 'Coimbatore', lat: 11.0125, lng: 76.9558 },
  { pincode: '641004', name: 'R.S. Puram', town: 'Coimbatore', lat: 11.006, lng: 76.949 },
  { pincode: '641005', name: 'Tatabad', town: 'Coimbatore', lat: 11.0155, lng: 76.9583 },
  { pincode: '641006', name: 'Peelamedu', town: 'Coimbatore', lat: 11.03, lng: 77.008 },
  { pincode: '641009', name: 'Ganapathy', town: 'Coimbatore', lat: 11.043, lng: 76.974 },
  { pincode: '641010', name: 'Perur', town: 'Coimbatore', lat: 10.9718, lng: 76.9115 },
  { pincode: '641011', name: 'Saibaba Colony', town: 'Coimbatore', lat: 11.023, lng: 76.945 },
  { pincode: '641012', name: 'Gandhipuram', town: 'Coimbatore', lat: 11.018, lng: 76.966 },
  { pincode: '641014', name: 'Ramanathapuram', town: 'Coimbatore', lat: 10.9903, lng: 76.9905 },
  { pincode: '641015', name: 'Kavundampalayam', town: 'Coimbatore', lat: 11.0405, lng: 76.9345 },
  { pincode: '641018', name: 'Race Course', town: 'Coimbatore', lat: 10.9975, lng: 76.9705 },
  {
    pincode: '641020',
    name: 'Periyanaickenpalayam',
    town: 'Coimbatore',
    lat: 11.1095,
    lng: 76.9435,
  },
  { pincode: '641023', name: 'Podanur', town: 'Coimbatore', lat: 10.9655, lng: 76.9565 },
  { pincode: '641025', name: 'Vadavalli', town: 'Coimbatore', lat: 11.0245, lng: 76.9018 },
  { pincode: '641027', name: 'Kuniamuthur', town: 'Coimbatore', lat: 10.9475, lng: 76.9355 },
  { pincode: '641028', name: 'Singanallur', town: 'Coimbatore', lat: 11.006, lng: 77.029 },
  { pincode: '641029', name: 'Ondipudur', town: 'Coimbatore', lat: 10.9895, lng: 77.0395 },
  { pincode: '641035', name: 'Thudiyalur', town: 'Coimbatore', lat: 11.0725, lng: 76.9385 },
  { pincode: '641038', name: 'Sowripalayam', town: 'Coimbatore', lat: 11.0005, lng: 76.9995 },
  { pincode: '641041', name: 'Kalapatti', town: 'Coimbatore', lat: 11.0555, lng: 77.0245 },
  { pincode: '641043', name: 'Chinniampalayam', town: 'Coimbatore', lat: 11.0135, lng: 77.0365 },
  { pincode: '641045', name: 'Sundarapuram', town: 'Coimbatore', lat: 10.9575, lng: 76.9825 },
  {
    pincode: '641046',
    name: 'Bharathiar University',
    town: 'Coimbatore',
    lat: 11.0295,
    lng: 76.8805,
  },
  { pincode: '641047', name: 'Vilankurichi', town: 'Coimbatore', lat: 11.0645, lng: 76.9995 },
  { pincode: '641048', name: 'Saravanampatti', town: 'Coimbatore', lat: 11.0785, lng: 76.9995 },
  { pincode: '641062', name: 'Kurichi', town: 'Coimbatore', lat: 10.9425, lng: 76.9705 },
  { pincode: '641105', name: 'Madukkarai', town: 'Coimbatore', lat: 10.9045, lng: 76.9545 },
  { pincode: '641109', name: 'Thondamuthur', town: 'Coimbatore', lat: 10.9905, lng: 76.8395 },
  { pincode: '641402', name: 'Sulur', town: 'Coimbatore', lat: 11.0245, lng: 77.1265 },
  { pincode: '641653', name: 'Annur', town: 'Coimbatore', lat: 11.2335, lng: 77.1065 },

  // ---- Tiruppur ----
  { pincode: '641601', name: 'Tiruppur Town', town: 'Tiruppur', lat: 11.1085, lng: 77.3411 },
  { pincode: '641602', name: 'Tiruppur North', town: 'Tiruppur', lat: 11.1215, lng: 77.3385 },
  { pincode: '641603', name: 'Tiruppur South', town: 'Tiruppur', lat: 11.0935, lng: 77.3455 },
  { pincode: '641604', name: 'Tiruppur East', town: 'Tiruppur', lat: 11.1125, lng: 77.3625 },
  { pincode: '641605', name: 'Veerapandi', town: 'Tiruppur', lat: 11.0785, lng: 77.3185 },
  { pincode: '641606', name: 'Anuparpalayam', town: 'Tiruppur', lat: 11.1305, lng: 77.3545 },
  { pincode: '641607', name: 'Mannarai', town: 'Tiruppur', lat: 11.0885, lng: 77.3045 },
  { pincode: '641608', name: 'Perumanallur', town: 'Tiruppur', lat: 11.1455, lng: 77.2585 },
  { pincode: '641654', name: 'Avinashi', town: 'Tiruppur', lat: 11.1935, lng: 77.2685 },
  { pincode: '641664', name: 'Palladam', town: 'Tiruppur', lat: 10.9935, lng: 77.2865 },
  { pincode: '641687', name: 'Kangeyam Road', town: 'Tiruppur', lat: 11.1165, lng: 77.3815 },

  // ---- Mettupalayam ----
  { pincode: '641301', name: 'Mettupalayam', town: 'Mettupalayam', lat: 11.2995, lng: 76.9365 },
  { pincode: '641302', name: 'Sirumugai', town: 'Mettupalayam', lat: 11.3245, lng: 77.0045 },
  { pincode: '641104', name: 'Karamadai', town: 'Mettupalayam', lat: 11.2355, lng: 76.9595 },
  { pincode: '641305', name: 'Thekkampatti', town: 'Mettupalayam', lat: 11.2645, lng: 76.9165 },
]

export const AREA_BY_PINCODE = new Map(AREAS.map((area) => [area.pincode, area]))

const TOWNS: Town[] = ['Coimbatore', 'Tiruppur', 'Mettupalayam']

/**
 * The area for a pincode, listed or not.
 *
 * An unlisted pincode still has to produce coordinates, or the person who types
 * it is invisible to every organisation. It is placed at the centre of the town
 * its neighbours belong to — coarse, and honest about being coarse, which beats
 * refusing to let somebody sign up because their village is not on a list.
 */
export function areaFor(pincode: string): Area | null {
  const known = AREA_BY_PINCODE.get(pincode)
  if (known) return known
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return null

  const neighbours = AREAS.filter((area) => area.pincode.slice(0, 4) === pincode.slice(0, 4))
  const town = neighbours[0]?.town ?? 'Coimbatore'
  return { pincode, name: `Pincode ${pincode}`, town, ...TOWN_CENTRE[town] }
}

export function areaOptions() {
  // Grouped by town, so a Tiruppur donor is not scrolling past 30 Coimbatore
  // suburbs to reach their own.
  return TOWNS.flatMap((town) =>
    AREAS.filter((area) => area.town === town).map((area) => ({
      value: area.pincode,
      label: area.name,
      detail: `${area.pincode} · ${town}`,
    })),
  )
}
