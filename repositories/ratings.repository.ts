import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RepositoryError } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'

export type RatingRow = Tables<'property_ratings'>

export async function getRating(ratingId: number): Promise<RatingRow | null> {
  const { data, error } = await createAdminClient()
    .from('property_ratings')
    .select('*')
    .eq('rating_id', ratingId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load the review.', error)
  return data
}

export async function getUserRating(
  propertyId: number,
  userId: number,
): Promise<RatingRow | null> {
  const { data, error } = await createAdminClient()
    .from('property_ratings')
    .select('*')
    .eq('property_id', propertyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new RepositoryError('Failed to load your review.', error)
  return data
}

export async function listRatingsByProperty(
  propertyId: number,
): Promise<RatingRow[]> {
  const { data, error } = await createAdminClient()
    .from('property_ratings')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load reviews.', error)
  return data ?? []
}

export async function listRatingsByUser(userId: number): Promise<RatingRow[]> {
  const { data, error } = await createAdminClient()
    .from('property_ratings')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load your reviews.', error)
  return data ?? []
}

export async function listRatingsByProperties(
  propertyIds: number[],
): Promise<RatingRow[]> {
  if (propertyIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('property_ratings')
    .select('*')
    .in('property_id', [...new Set(propertyIds)])
    .order('created_at', { ascending: false })
  if (error) throw new RepositoryError('Failed to load reviews.', error)
  return data ?? []
}

export async function upsertRating(input: {
  property_id: number
  user_id: number
  rating: number
  review: string | null
}): Promise<RatingRow> {
  const { data, error } = await createAdminClient()
    .from('property_ratings')
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: 'property_id,user_id' },
    )
    .select('*')
    .single()
  if (error) throw new RepositoryError('Failed to save your review.', error)
  return data
}

export async function respondToRating(
  ratingId: number,
  input: { landlord_response: string; landlord_response_by: number },
): Promise<void> {
  const { error } = await createAdminClient()
    .from('property_ratings')
    .update({
      landlord_response: input.landlord_response,
      landlord_response_by: input.landlord_response_by,
      landlord_response_at: new Date().toISOString(),
    })
    .eq('rating_id', ratingId)
  if (error) throw new RepositoryError('Failed to post the response.', error)
}
