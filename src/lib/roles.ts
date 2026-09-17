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
