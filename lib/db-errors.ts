import { ServiceError } from '@/services/errors'

/**
 * Postgres "undefined column" (42703) on the advance / deposit columns means migration 0014 has
 * not been applied yet. Say so, instead of the generic "something went wrong".
 */
export function explainMissingAdvanceColumns(error: unknown): never {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  if (
    cause?.code === '42703' &&
    /require_(advance|deposit)/.test(cause.message ?? '')
  ) {
    throw new ServiceError(
      'Advance and deposit need a one-time database update. Run migration 0014_advance_and_deposit.sql in the Supabase SQL editor, then try again.',
      'conflict',
    )
  }
  throw error
}

/** Keep only the switches that are turned ON — a new record's default is off, so nothing else needs writing. */
export function onlyEnabledRequirements<
  T extends { require_advance?: boolean; require_deposit?: boolean },
>(values: T): T {
  const out = { ...values }
  if (out.require_advance !== true) delete out.require_advance
  if (out.require_deposit !== true) delete out.require_deposit
  return out
}

/**
 * Migration 0015 (profile photos + ID verification) not applied: the table / column / bucket is
 * missing. Say so instead of the generic "something went wrong".
 */
export function isVerificationSetupProblem(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  const message = error instanceof Error ? error.message : ''
  return (
    /migration 0015/.test(message) ||
    ((cause?.code === '42P01' || cause?.code === '42703') &&
      /identity_verifications|id_verified_at/.test(cause?.message ?? '')) ||
    /bucket not found/i.test(cause?.message ?? '')
  )
}

export const VERIFICATION_SETUP_MESSAGE =
  'This feature needs a one-time database update. Run migration 0015_profile_photos_and_id_verification.sql in the Supabase SQL editor, then try again.'

export async function withSetupHint<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isVerificationSetupProblem(error)) {
      throw new ServiceError(VERIFICATION_SETUP_MESSAGE, 'conflict')
    }
    throw error
  }
}
