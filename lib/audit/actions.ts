/** The catalogue of audited actions: stable codes, plus how each is shown in the admin's log. */

export const AUDIT_ACTIONS = {
  'property.status_changed': 'Listing status changed',
  'property.flags_changed': 'Listing flags changed',
  'user.activated': 'Account activated',
  'user.deactivated': 'Account deactivated',
  'user.password_reset': 'Account password reset by admin',
  'landlord.created': 'Landlord account created',
  'application.approved': 'Landlord application approved',
  'application.rejected': 'Landlord application rejected',
  'application.documents_viewed': 'Application documents viewed',
  'application.password_reset': 'Applicant password reset',
  'boost.package_saved': 'Boost package saved',
  'verification.viewed': 'ID pictures viewed',
  'verification.approved': 'ID approved',
  'verification.rejected': 'ID rejected',
  'booking.status_changed': 'Booking status changed by admin',
  'payment.decided': 'Payment decided by admin',
  'payment.refunded': 'Payment refunded',
  'boost.cancelled': 'Boost cancelled',
  'ad.created': 'Ad created',
  'ad.updated': 'Ad updated',
  'ad.deleted': 'Ad deleted',
  'account.deleted': 'Account deleted by its owner',
  'report.exported': 'Report exported',
  'payout.settings_changed': 'Payout & fee settings changed',
  'payout.completed': 'Withdrawal marked paid',
  'payout.failed': 'Withdrawal rejected',
  'app.apk_published': 'Android app published',
} as const

export type AuditAction = keyof typeof AUDIT_ACTIONS

/** "payment_created" -> "Payment created" (codes the database wrote itself). */
const humanize = (code: string): string => {
  const text = code.replace(/[._]+/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : code
}

export const auditActionLabel = (code: string): string =>
  (AUDIT_ACTIONS as Record<string, string>)[code] ?? humanize(code)

/** A description for rows written by the database, which carry no summary of their own. */
export function describeLegacyAudit(
  action: string,
  entityType: string | null,
  entityId: number | null,
): string {
  const what = entityType
    ? `${entityType.replace(/_/g, ' ')}${entityId !== null ? ` #${entityId}` : ''}`
    : ''
  return what ? `${humanize(action)} — ${what}` : humanize(action)
}

/** Groups for the filter dropdown. */
export const AUDIT_GROUPS = [
  { prefix: 'property.', label: 'Listings' },
  { prefix: 'user.', label: 'Accounts' },
  { prefix: 'landlord.', label: 'Landlords' },
  { prefix: 'application.', label: 'Landlord applications' },
  { prefix: 'boost.', label: 'Boosts' },
  { prefix: 'verification.', label: 'ID verification' },
  { prefix: 'booking.', label: 'Bookings' },
  { prefix: 'payment.', label: 'Payments' },
  { prefix: 'ad.', label: 'Ads' },
  { prefix: 'account.', label: 'Account deletions' },
  { prefix: 'report.', label: 'Reports' },
  { prefix: 'payout.', label: 'Payouts & fees' },
] as const

/** Never store secrets or personal contents in the log: keep only these small scalar detail values. */
export function cleanDetails(
  details: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(details ?? {})) {
    if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      out[key] = value
    else if (typeof value === 'string') out[key] = value.slice(0, 300)
  }
  return out
}
