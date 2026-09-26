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

/**
 * Migration 0016 (portal-ads bucket, `link_label` / `updated_at` columns) not applied. The audit
 * log and the ad tables themselves come from the baseline schema and always exist.
 */
export function isAdminToolsSetupProblem(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  const message = error instanceof Error ? error.message : ''
  const detail = cause?.message ?? ''
  return (
    /migration 0016/.test(message) ||
    ((cause?.code === '42703' || cause?.code === 'PGRST204') &&
      /link_label|updated_at/.test(detail)) ||
    /bucket not found/i.test(detail)
  )
}

export const ADMIN_TOOLS_SETUP_MESSAGE =
  'This needs a one-time database update. Run migration 0016_audit_logs_and_portal_ads.sql in the Supabase SQL editor, then try again.'

/** Migration 0017 (landlord payouts) not applied: the fee column or the withdrawal function is missing. */
export function isPayoutSetupProblem(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  const message = error instanceof Error ? error.message : ''
  const detail = cause?.message ?? message
  return (
    /migration 0017/.test(message) ||
    ((cause?.code === '42703' || cause?.code === 'PGRST204') &&
      /paymongo_fee_rate/.test(detail)) ||
    cause?.code === 'PGRST202' ||
    /request_landlord_payout.*does not exist|Could not find the function/i.test(
      detail,
    )
  )
}

export const PAYOUT_SETUP_MESSAGE =
  'Withdrawals need a one-time database update. Run migration 0017_landlord_payouts.sql in the Supabase SQL editor, then reload.'

/** Migrations 0020 / 0021 (landlord applications and their documents) not applied: a table or the bucket is missing. */
export function isApplicationsSetupProblem(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  const message = error instanceof Error ? error.message : ''
  const detail = cause?.message ?? ''
  return (
    ((cause?.code === '42P01' || cause?.code === 'PGRST205') &&
      /landlord_applications|landlord_application_documents/.test(detail)) ||
    /bucket not found/i.test(detail) ||
    /application documents are not set up/i.test(message)
  )
}

export const APPLICATIONS_SETUP_MESSAGE =
  'Applications need a one-time database update. Run migration 0020_landlord_applications.sql and then 0021_application_documents.sql in the Supabase SQL editor, then reload.'

/** Migration 0022 (tenant preferences and match log) not applied: a table is missing. */
export function isMatchingSetupProblem(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  const detail = cause?.message ?? ''
  return (
    ((cause?.code === '42P01' || cause?.code === 'PGRST205') &&
      /tenant_preferences|match_logs/.test(detail)) ||
    // 0023 not applied: the room_type_ids column is missing (or room_kind is still required)
    ((cause?.code === '42703' || cause?.code === 'PGRST204') &&
      /room_type_ids|room_kind/.test(detail))
  )
}

export const MATCHING_SETUP_MESSAGE =
  'Matching needs a one-time database update. Run migrations 0022_tenant_preferences_and_matching.sql and 0023_tenant_room_types.sql in the Supabase SQL editor, then reload.'

/** Migration 0024 not applied: a boost row cannot get its id (`boost_id` has no default). */
export function isBoostIdProblem(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  return cause?.code === '23502' && /boost_id/.test(cause.message ?? '')
}

export const BOOST_ID_SETUP_MESSAGE =
  'Boosts need a one-time database update. Run migration 0024_property_boost_ids.sql in the Supabase SQL editor, then try again.'
