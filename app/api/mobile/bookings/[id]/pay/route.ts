import { z } from 'zod'

import { idParam, mobileRoute, readJson } from '@/lib/api/mobile'
import { assertPaymentsSafeForEnvironment } from '@/lib/paymongo/mode'
import {
  bridgeUrl,
  isAllowedAppReturnUrl,
  resolveCheckoutOrigin,
} from '@/lib/paymongo/mobile-return'
import { parseOrThrow, ServiceError } from '@/services/errors'
import { startBookingCheckout } from '@/services/paymongo.service'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ returnUrl: z.string().min(1).max(500) })

/**
 * Start PayMongo checkout for a booking. Body: `{ returnUrl }` — the app address PayMongo's
 * bridge should send the tenant back to. The amount is never taken from the client: the service
 * reads the booking's own total.
 */
export const POST = mobileRoute<{ id: string }>(async ({ request, params }) => {
  const bookingId = idParam(params.id)
  const { returnUrl } = parseOrThrow(bodySchema, await readJson(request))

  const production = process.env.NODE_ENV === 'production'
  if (!isAllowedAppReturnUrl(returnUrl, { production })) {
    throw new ServiceError('Invalid return address.', 'validation', {
      returnUrl: ['That return address is not allowed.'],
    })
  }

  // Never let a developer's phone charge real money by accident.
  assertPaymentsSafeForEnvironment()

  const origin = resolveCheckoutOrigin(request.url, process.env)
  if (!origin) {
    throw new ServiceError('Online payments are not available yet.', 'conflict')
  }

  const { checkoutUrl, paymentId } = await startBookingCheckout({
    bookingId,
    reusePending: true,
    urls: (ids) => ({
      successUrl: bridgeUrl(origin, returnUrl, { ...ids, result: 'success' }),
      cancelUrl: bridgeUrl(origin, returnUrl, { ...ids, result: 'cancelled' }),
    }),
  })
  return { checkoutUrl, paymentId }
})
