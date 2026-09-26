import { z } from 'zod'

import { mobileRoute, readJson } from '@/lib/api/mobile'
import { isPaymongoConfigured } from '@/lib/env.server'
import { assertPaymentsSafeForEnvironment } from '@/lib/paymongo/mode'
import {
  bridgeUrl,
  isAllowedAppReturnUrl,
  resolveCheckoutOrigin,
} from '@/lib/paymongo/mobile-return'
import { getMyBoosts } from '@/services/boosts.service'
import { parseOrThrow, ServiceError } from '@/services/errors'
import { startBoostCheckout } from '@/services/paymongo.service'

export const dynamic = 'force-dynamic'

/** Packages, the properties that can be boosted, and the landlord's boosts (pending payments are checked first). */
export const GET = mobileRoute(
  async () => ({
    ...(await getMyBoosts()),
    onlinePaymentsAvailable: isPaymongoConfigured(),
  }),
  { roles: ['landlord'] },
)

const bodySchema = z.object({
  propertyId: z.number().int().positive(),
  packageId: z.number().int().positive(),
  returnUrl: z.string().min(1).max(500),
})

/**
 * Start paying for a boost. The price comes from the package the admin set — never from the app.
 * `returnUrl` is where PayMongo's bridge page sends the landlord back to inside the app.
 */
export const POST = mobileRoute(
  async ({ request }) => {
    const { propertyId, packageId, returnUrl } = parseOrThrow(
      bodySchema,
      await readJson(request),
    )
    const production = process.env.NODE_ENV === 'production'
    if (!isAllowedAppReturnUrl(returnUrl, { production })) {
      throw new ServiceError('Invalid return address.', 'validation', {
        returnUrl: ['That return address is not allowed.'],
      })
    }
    assertPaymentsSafeForEnvironment() // never let a developer's phone charge real money by accident

    const origin = resolveCheckoutOrigin(request.url, process.env)
    if (!origin) {
      throw new ServiceError(
        'Online payments are not available yet.',
        'conflict',
      )
    }
    // The bridge carries a payment and a booking id; a boost has neither, so its own id fills both.
    return startBoostCheckout({
      propertyId,
      packageId,
      urls: ({ boostId }) => ({
        successUrl: bridgeUrl(origin, returnUrl, {
          paymentId: boostId,
          bookingId: boostId,
          result: 'success',
        }),
        cancelUrl: bridgeUrl(origin, returnUrl, {
          paymentId: boostId,
          bookingId: boostId,
          result: 'cancelled',
        }),
      }),
    })
  },
  { roles: ['landlord'] },
)
