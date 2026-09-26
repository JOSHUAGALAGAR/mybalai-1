/**
 * Landlord earnings and withdrawal rules. Pure (no I/O): the server applies them, the admin form
 * previews them, and they are unit-tested directly.
 */

export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100

/** What a tenant's payment turns into for the landlord. */
export type FeeBreakdown = {
  gross: number
  paymongoFee: number
  platformFee: number
  net: number
}

/** Same arithmetic as the database trigger: fees are percentages of the payment, rounded to centavos. */
export function feeBreakdown(
  gross: number,
  rates: { paymongoPct: number; platformPct: number },
): FeeBreakdown {
  const paymongoFee = round2((gross * rates.paymongoPct) / 100)
  const platformFee = round2((gross * rates.platformPct) / 100)
  return {
    gross,
    paymongoFee,
    platformFee,
    net: Math.max(round2(gross - paymongoFee - platformFee), 0),
  }
}

/** "1.5" not "1.50", "2" not "2.00". */
export const formatPct = (n: number): string => String(Number(n.toFixed(2)))

/* ---- the withdrawal day (Philippine calendar) ---- */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

/** The calendar date in the Philippines for an instant. */
export function manilaDate(now: Date): {
  year: number
  month: number
  day: number
} {
  const d = new Date(now.getTime() + MANILA_OFFSET_MS)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  }
}

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()

/** "The 30th" in a month with fewer days means the last day of that month. */
export const effectiveDay = (
  day: number,
  year: number,
  month: number,
): number => Math.min(Math.max(day, 1), daysInMonth(year, month))

export function isWithdrawalDay(now: Date, day: number): boolean {
  const t = manilaDate(now)
  return t.day === effectiveDay(day, t.year, t.month)
}

/** The next withdrawal date (today counts) as YYYY-MM-DD. */
export function nextWithdrawalDate(now: Date, day: number): string {
  const t = manilaDate(now)
  let { year, month } = t
  if (t.day > effectiveDay(day, year, month)) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  const d = effectiveDay(day, year, month)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const WITHDRAWAL_METHODS = [
  { code: 'gcash', label: 'GCash' },
  { code: 'maya', label: 'Maya' },
  { code: 'bank', label: 'Bank account' },
] as const
export type WithdrawalMethodCode = (typeof WITHDRAWAL_METHODS)[number]['code']
export const withdrawalMethodLabel = (code: string): string =>
  WITHDRAWAL_METHODS.find((m) => m.code === code)?.label ?? code

/** "•••• 4567" — enough to recognise, not enough to misuse. */
export function maskAccountNumber(value: string): string {
  const digits = value.replace(/\s+/g, '')
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`
}

/** Why a landlord cannot withdraw right now, in words — or null when they can. */
export function withdrawalBlocker(input: {
  now: Date
  day: number
  available: number
  threshold: number
  hasMethod: boolean
  hasOpenPayout: boolean
}): string | null {
  if (input.hasOpenPayout)
    return 'Your last withdrawal is still being processed.'
  if (!input.hasMethod) return 'Add where the money should be sent first.'
  if (!isWithdrawalDay(input.now, input.day)) {
    return `Withdrawals open on day ${input.day} of each month.`
  }
  if (input.available <= 0) return 'You have no earnings ready to withdraw yet.'
  if (input.available < input.threshold) {
    return `The minimum withdrawal is ₱${input.threshold.toLocaleString('en-PH')}.`
  }
  return null
}
