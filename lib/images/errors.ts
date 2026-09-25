/** Postgres "undefined column / table" or a missing storage bucket = migration 0013 not applied. */
export function isPhotoSetupProblem(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  return (
    cause?.code === '42703' ||
    cause?.code === '42P01' ||
    /bucket not found/i.test(cause?.message ?? '')
  )
}

export const PHOTO_SETUP_MESSAGE =
  'Photo uploads are not set up yet. Run migration 0013_property_images.sql in the Supabase SQL editor, then try again.'
