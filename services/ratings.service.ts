import 'server-only'

import { requireUser, type CurrentUser } from '@/lib/auth/dal'
import { isSuperadmin } from '@/lib/permissions/properties'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as discoveryRepo from '@/repositories/discovery.repository'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as ratingsRepo from '@/repositories/ratings.repository'
import * as referenceRepo from '@/repositories/reference.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { requireManageableProperty } from '@/services/property-access'
import { respondReviewSchema, upsertRatingSchema } from '@/schemas/rating'

const STAYED = new Set(['checked_in', 'checked_out'])

async function hasStayedAt(
  userId: number,
  propertyId: number,
): Promise<boolean> {
  const [bookings, statuses] = await Promise.all([
    bookingsRepo.listBookingsByUser(userId),
    referenceRepo.listBookingStatuses(),
  ])
  const codeById = new Map(
    statuses.map((s) => [s.booking_status_id, s.status_code]),
  )
  return bookings.some(
    (b) =>
      b.property_id === propertyId &&
      b.booking_status_id != null &&
      STAYED.has(codeById.get(b.booking_status_id) ?? ''),
  )
}

/* ------------------------------------------------------------------ *
 * Tenant
 * ------------------------------------------------------------------ */

export type RatingContext = {
  propertyId: number
  propertyName: string
  canRate: boolean
  existing: { rating: number; review: string | null } | null
}

export async function getRatingContext(
  propertyId: number,
): Promise<RatingContext> {
  const user = await requireUser()
  const property = await discoveryRepo.getVisibleProperty(propertyId)
  if (!property) throw new ServiceError('Property not found.', 'not_found')

  const [canRate, existing] = await Promise.all([
    hasStayedAt(user.legacyUserId, propertyId),
    ratingsRepo.getUserRating(propertyId, user.legacyUserId),
  ])

  return {
    propertyId,
    propertyName: property.property_name,
    canRate,
    existing: existing
      ? { rating: existing.rating, review: existing.review }
      : null,
  }
}

export async function submitRating(
  propertyId: number,
  input: unknown,
): Promise<void> {
  const user = await requireUser()
  if (!user.roles.includes('tenant') && !isSuperadmin(user)) {
    throw new ServiceError(
      'Only a tenant account can leave a review.',
      'forbidden',
    )
  }

  const property = await discoveryRepo.getVisibleProperty(propertyId)
  if (!property) throw new ServiceError('Property not found.', 'not_found')

  if (!(await hasStayedAt(user.legacyUserId, propertyId))) {
    throw new ServiceError(
      'You can review a property after a stay there.',
      'forbidden',
    )
  }

  const data = parseOrThrow(upsertRatingSchema, input)
  await ratingsRepo.upsertRating({
    property_id: propertyId,
    user_id: user.legacyUserId,
    rating: data.rating,
    review: data.review ?? null,
  })

  if (property.property_owner != null) {
    await messagingRepo.notify({
      user_id: property.property_owner,
      notification_type: 'REVIEW',
      title: 'New review',
      message: `A tenant left a ${data.rating}-star review.`,
      reference_type: 'review',
      reference_id: propertyId,
    })
  }
}

export type MyRating = {
  ratingId: number
  propertyId: number
  propertyName: string | null
  rating: number
  review: string | null
  landlordResponse: string | null
  updatedAt: string
}

export async function listMyRatings(): Promise<MyRating[]> {
  const user = await requireUser()
  const rows = await ratingsRepo.listRatingsByUser(user.legacyUserId)
  const names = await bookingsRepo.propertyNamesByIds(
    rows.map((r) => r.property_id),
  )
  return rows.map((r) => ({
    ratingId: r.rating_id,
    propertyId: r.property_id,
    propertyName: names.get(r.property_id) ?? null,
    rating: r.rating,
    review: r.review,
    landlordResponse: r.landlord_response,
    updatedAt: r.updated_at,
  }))
}

/* ------------------------------------------------------------------ *
 * Manager (landlord / superadmin)
 * ------------------------------------------------------------------ */

export type ManagedReview = {
  ratingId: number
  propertyId: number
  propertyName: string | null
  reviewerName: string
  rating: number
  review: string | null
  createdAt: string
  landlordResponse: string | null
  landlordRespondedAt: string | null
  canRespond: boolean
}

async function ownedPropertyIds(user: CurrentUser): Promise<number[]> {
  if (isSuperadmin(user)) {
    return (await propertiesRepo.listProperties({})).map((p) => p.property_id)
  }
  return (
    await propertiesRepo.listProperties({ ownerId: user.legacyUserId })
  ).map((p) => p.property_id)
}

export async function listManagedReviews(): Promise<ManagedReview[]> {
  const user = await requireUser()
  const ids = await ownedPropertyIds(user)
  const rows = await ratingsRepo.listRatingsByProperties(ids)
  const [names, reviewerNames] = await Promise.all([
    bookingsRepo.propertyNamesByIds(rows.map((r) => r.property_id)),
    discoveryRepo.reviewerNames(rows.map((r) => r.user_id)),
  ])
  return rows.map((r) => ({
    ratingId: r.rating_id,
    propertyId: r.property_id,
    propertyName: names.get(r.property_id) ?? null,
    reviewerName: reviewerNames.get(r.user_id)?.split(' ')[0] ?? 'A tenant',
    rating: r.rating,
    review: r.review,
    createdAt: r.created_at,
    landlordResponse: r.landlord_response,
    landlordRespondedAt: r.landlord_response_at,
    canRespond: !r.landlord_response,
  }))
}

export async function respondToReview(
  ratingId: number,
  input: unknown,
): Promise<void> {
  const user = await requireUser()
  const rating = await ratingsRepo.getRating(ratingId)
  if (!rating) throw new ServiceError('Review not found.', 'not_found')

  await requireManageableProperty(rating.property_id)
  const data = parseOrThrow(respondReviewSchema, input)

  await ratingsRepo.respondToRating(ratingId, {
    landlord_response: data.response,
    landlord_response_by: user.legacyUserId,
  })

  await messagingRepo.notify({
    user_id: rating.user_id,
    notification_type: 'REVIEW',
    title: 'The landlord responded',
    message: 'Your review received a response.',
    reference_type: 'review',
    reference_id: rating.property_id,
  })
}
