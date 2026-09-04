'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as ratings from '@/services/ratings.service'
import { ServiceError } from '@/services/errors'

export type ReviewActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | undefined

function toErrorState(
  error: unknown,
  values?: Record<string, string>,
): ReviewActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[reviews] action failed:', error)
  return { status: 'error', message: 'Something went wrong.', values }
}

export async function submitRatingAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const propertyId = Number(formData.get('property_id'))
  const values = {
    rating: String(formData.get('rating') ?? ''),
    review: String(formData.get('review') ?? ''),
  }
  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    return { status: 'error', message: 'Invalid property.', values }
  }
  try {
    await ratings.submitRating(propertyId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath(`/discover/${propertyId}`)
  revalidatePath('/reviews')
  redirect(`/discover/${propertyId}`)
}

export async function respondReviewAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const ratingId = Number(formData.get('rating_id'))
  const values = { response: String(formData.get('response') ?? '') }
  if (!Number.isInteger(ratingId) || ratingId <= 0) {
    return { status: 'error', message: 'Invalid review.', values }
  }
  try {
    await ratings.respondToReview(ratingId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/landlord/reviews')
  redirect('/landlord/reviews')
}
