import {
  appReturnRedirect,
  isAllowedAppReturnUrl,
  isPaymentReturnResult,
} from '@/lib/paymongo/mobile-return'

export const dynamic = 'force-dynamic'

/**
 * PayMongo sends the tenant's browser here after checkout (public, no login). We bounce them into
 * the MyBalai mobile app. It carries no secrets: the app re-checks the real payment status with
 * the server. The `to` address is validated because this is otherwise an open redirect.
 */
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams
  const to = params.get('to')
  const paymentId = Number(params.get('payment'))
  const bookingId = Number(params.get('booking'))
  const result = params.get('result')

  const production = process.env.NODE_ENV === 'production'
  if (
    !to ||
    !isAllowedAppReturnUrl(to, { production }) ||
    !Number.isInteger(paymentId) ||
    paymentId <= 0 ||
    !Number.isInteger(bookingId) ||
    bookingId <= 0 ||
    !isPaymentReturnResult(result)
  ) {
    return new Response(
      'This link is not valid. Return to the MyBalai app to check your payment.',
      { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: appReturnRedirect(to, { paymentId, bookingId, result }),
      'Cache-Control': 'no-store',
    },
  })
}
