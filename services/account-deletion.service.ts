import 'server-only'

import {
  getPasswordAuthAgeSeconds,
  getSessionAuthMethods,
  invalidateCurrentUser,
  requireUser,
  type CurrentUser,
} from '@/lib/auth/dal'
import * as repo from '@/repositories/account-deletion.repository'
import * as profilePhoto from '@/repositories/profile-photo.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import * as verificationRepo from '@/repositories/verification.repository'
import { deleteAccountSchema } from '@/schemas/account'
import { ServiceError, parseOrThrow } from '@/services/errors'

/**
 * Deleting your own account (tenants and landlords, from the mobile app).
 *
 * What happens: the person's data is removed — name, email, phone, address, profile photo, ID
 * pictures, messages they sent, reviews, inquiries, notifications — and their login is deleted.
 * Bookings and payments stay (accounting records) but point at an anonymous "Deleted user".
 *
 * Safety rules: it is refused while any booking is still in progress; a password sign-in must be
 * fresh (they typed the password moments ago); and "DELETE" must be typed.
 */

const ACTIVE_BOOKING_CODES = [
  'pending',
  'payment_pending',
  'confirmed',
  'checked_in',
]
/** A password sign-in older than this is "not fresh": ask for the password again. */
export const FRESH_PASSWORD_SECONDS = 5 * 60

function accountKind(user: CurrentUser): 'tenant' | 'landlord' {
  if (user.roles.includes('superadmin') || user.roles.includes('caretaker')) {
    throw new ServiceError(
      'This account type cannot be deleted in the app. Contact MyBalai support.',
      'forbidden',
    )
  }
  if (user.roles.includes('landlord')) return 'landlord'
  if (user.roles.includes('tenant')) return 'tenant'
  throw new ServiceError(
    'This account cannot be deleted in the app.',
    'forbidden',
  )
}

async function activeBookingIds(): Promise<number[]> {
  const statuses = await referenceRepo.listBookingStatuses()
  return statuses
    .filter((s) => ACTIVE_BOOKING_CODES.includes(s.status_code))
    .map((s) => s.booking_status_id)
}

export type DeletionCheck = {
  role: 'tenant' | 'landlord'
  canDelete: boolean
  /** Plain-language reasons deletion is not possible right now. */
  blockers: string[]
}

export async function checkAccountDeletion(): Promise<DeletionCheck> {
  const user = await requireUser()
  const role = accountKind(user)
  const ids = await activeBookingIds()
  const count = await repo.countActiveBookings(
    role === 'tenant'
      ? { tenantId: user.legacyUserId }
      : { landlordId: user.legacyUserId },
    ids,
  )
  const blockers: string[] = []
  if (count > 0) {
    const one = count === 1
    blockers.push(
      role === 'tenant'
        ? `${count} of your ${one ? 'bookings is' : 'bookings are'} still in progress. Cancel ${one ? 'it' : 'them'} or wait until ${one ? 'it finishes' : 'they finish'}, then delete your account.`
        : `${count} ${one ? 'booking' : 'bookings'} on your properties ${one ? 'is' : 'are'} still in progress. Finish or cancel ${one ? 'it' : 'them'} first, then delete your account.`,
    )
  }
  return { role, canDelete: blockers.length === 0, blockers }
}

export async function deleteMyAccount(input: unknown): Promise<void> {
  const user = await requireUser()
  parseOrThrow(deleteAccountSchema, input)
  const role = accountKind(user)

  // 1. Who is asking, and how recently did they prove it?
  const methods = await getSessionAuthMethods()
  if (methods.length === 0) {
    throw new ServiceError(
      'Delete your account from the MyBalai app.',
      'forbidden',
    )
  }
  if (methods.includes('password')) {
    const age = await getPasswordAuthAgeSeconds()
    if (age === null || age > FRESH_PASSWORD_SECONDS) {
      throw new ServiceError(
        'For your security, enter your password again to delete your account.',
        'forbidden',
      )
    }
  }

  // 2. Nothing in progress.
  const check = await checkAccountDeletion()
  if (!check.canDelete) throw new ServiceError(check.blockers[0], 'conflict')

  // 3. Remove personal content (files first, so nothing is left behind if a later step fails).
  const userId = user.legacyUserId
  const [idFiles, avatarPath] = await Promise.all([
    repo.listIdFilePaths(userId),
    profilePhoto
      .currentAvatarUrl(userId)
      .then((url) => profilePhoto.pathFromPublicUrl(url)),
  ])
  await verificationRepo.removeObjects(idFiles).catch(() => {})
  if (avatarPath) await profilePhoto.removeObjects([avatarPath]).catch(() => {})

  await repo.deleteIdVerifications(userId)
  await repo.deleteNotifications(userId)
  await repo.deleteMessagesSentBy(userId)
  await repo.deleteInquiriesBy(userId)
  await repo.deleteReviewsBy(userId)
  await repo.deleteTenantProfile(userId)

  if (role === 'landlord') {
    for (const propertyId of await repo.listOwnedPropertyIds(userId)) {
      await propertiesRepo.softDeleteProperty(propertyId) // off every listing
    }
    await repo.cancelSubscriptions(userId)
    await repo.deleteLandlordProfile(userId)
  }

  // 4. Point of no return: scrub the account row, THEN delete the login. (In this order the login
  //    is no longer linked to the row, so removing it cannot cascade into bookings or payments.)
  await repo.anonymizeAccount(userId)
  invalidateCurrentUser(user.authUserId)
  await repo.deleteAuthUser(user.authUserId).catch((error) => {
    // The account is already anonymous and unreachable; an admin can remove the leftover login.
    console.error(
      '[account-deletion] login removal failed for user',
      userId,
      error,
    )
  })
  console.info('[account-deletion] account deleted:', userId, role)
}
