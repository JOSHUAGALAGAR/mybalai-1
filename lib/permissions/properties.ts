import type { CurrentUser } from '@/lib/auth/dal'

/**
 * Pure authorization predicates for the property module. No I/O — callers pass
 * the current user and (where relevant) the property being acted on. Rooms,
 * beds, and rates inherit their permission from the parent property.
 */

type OwnableProperty = { property_owner: number | null }

export function isSuperadmin(user: CurrentUser): boolean {
  return user.roles.includes('superadmin')
}

export function isLandlord(user: CurrentUser): boolean {
  return user.roles.includes('landlord')
}

export function ownsProperty(
  user: CurrentUser,
  property: OwnableProperty,
): boolean {
  return (
    property.property_owner !== null &&
    property.property_owner === user.legacyUserId
  )
}

export function canCreateProperty(user: CurrentUser): boolean {
  return isSuperadmin(user) || isLandlord(user)
}

export function canManageProperty(
  user: CurrentUser,
  property: OwnableProperty,
): boolean {
  if (isSuperadmin(user)) return true
  return isLandlord(user) && ownsProperty(user, property)
}

/** Only a superadmin may toggle verification / featured flags (spec §38). */
export function canSetVerificationFlags(user: CurrentUser): boolean {
  return isSuperadmin(user)
}
