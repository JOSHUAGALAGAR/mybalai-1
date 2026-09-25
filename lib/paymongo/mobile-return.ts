/**
 * Helpers for sending a tenant back into the mobile app after PayMongo checkout.
 *
 * PayMongo redirects the browser to an ordinary web address (success/cancel URL), so the app
 * cannot be the destination directly. Instead PayMongo returns to a tiny public "bridge" page on
 * this site (`/pay/return`), which 302s to the app's own address (`mybalaimobile://…`).
 *
 * That bridge takes the app address from the URL, so it MUST only accept addresses that belong to
 * the MyBalai app — otherwise it is an open redirect anyone could use in a phishing link.
 *
 * Pure functions (no I/O) so they are easy to test.
 */

const APP_SCHEMES = ['mybalaimobile:']
// Expo Go / dev clients use these while developing. Never accepted in production.
const DEV_SCHEMES = ['exp:', 'exp+mybalaimobile:']

export type PaymentReturnResult = 'success' | 'cancelled'

export function isPaymentReturnResult(
  value: unknown,
): value is PaymentReturnResult {
  return value === 'success' || value === 'cancelled'
}

/** Is `value` an address that opens the MyBalai app (and nothing else)? */
export function isAllowedAppReturnUrl(
  value: string,
  options: { production: boolean },
): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  const allowed = options.production
    ? APP_SCHEMES
    : [...APP_SCHEMES, ...DEV_SCHEMES]
  if (!allowed.includes(url.protocol)) return false
  // No `user:pass@` tricks, and no fragment that could smuggle a second destination.
  if (url.username || url.password || url.hash) return false
  return true
}

/** The web address PayMongo should send the browser to (the bridge page). */
export function bridgeUrl(
  origin: string,
  appReturnUrl: string,
  ids: { paymentId: number; bookingId: number; result: PaymentReturnResult },
): string {
  const url = new URL('/pay/return', origin)
  url.searchParams.set('to', appReturnUrl)
  url.searchParams.set('payment', String(ids.paymentId))
  url.searchParams.set('booking', String(ids.bookingId))
  url.searchParams.set('result', ids.result)
  return url.toString()
}

/** The app address the bridge redirects to, with the payment details appended. */
export function appReturnRedirect(
  appReturnUrl: string,
  ids: { paymentId: number; bookingId: number; result: PaymentReturnResult },
): string {
  const url = new URL(appReturnUrl)
  url.searchParams.set('payment', String(ids.paymentId))
  url.searchParams.set('booking', String(ids.bookingId))
  url.searchParams.set('result', ids.result)
  return url.toString()
}

/**
 * The public origin PayMongo (and the tenant's phone) can reach.
 * - production: the configured site URL — never trust request headers for this.
 * - development: the address the phone used to reach us (e.g. http://192.168.1.19:3000),
 *   because the configured `http://localhost:3000` is not reachable from a phone.
 */
export function resolveCheckoutOrigin(
  requestUrl: string,
  env: { NODE_ENV?: string; NEXT_PUBLIC_SITE_URL?: string },
): string | null {
  if (env.NODE_ENV === 'production') {
    const configured = env.NEXT_PUBLIC_SITE_URL
    return configured ? new URL(configured).origin : null
  }
  return new URL(requestUrl).origin
}
