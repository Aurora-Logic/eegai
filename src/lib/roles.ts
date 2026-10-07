import type { Role } from '@/lib/state-machine'

/**
 * What each role is called on screen.
 *
 * The database says `volunteer`; the donor-module spec says Delivery Partner.
 * The enum stays — renaming it would touch every policy for a word — and this
 * map is the one place the product's name for it lives.
 */
export const ROLE_LABEL: Record<Role, string> = {
  donor: 'Donor',
  ngo: 'Organisation',
  volunteer: 'Delivery partner',
  admin: 'Admin',
}

/**
 * What to call the signed-in person, hospital included.
 *
 * A hospital and an NGO share the `ngo` role but are two different things to
 * everyone using the product, so the header says which one you are.
 */
export function labelForUser(user: {
  role: Role
  profile?: { org_type?: 'ngo' | 'hospital' | null }
}): string {
  if (user.role === 'ngo' && user.profile?.org_type === 'hospital') return 'Hospital'
  if (user.role === 'ngo') return 'NGO'
  return ROLE_LABEL[user.role]
}
