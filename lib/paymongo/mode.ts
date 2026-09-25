import 'server-only'

import { serverEnv } from '@/lib/env.server'
import { ServiceError } from '@/services/errors'

export type PaymongoMode = 'live' | 'test' | 'unset' | 'unknown'

/** Which kind of PayMongo secret key this is (pure — exported for tests). */
export function paymongoKeyMode(key: string | null | undefined): PaymongoMode {
  if (!key) return 'unset'
  if (key.startsWith('sk_live_')) return 'live'
  if (key.startsWith('sk_test_')) return 'test'
  return 'unknown'
}

/**
 * Real money guard for development. A LIVE key on a developer machine turns every "Pay now" tap
 * into a real charge, so refuse unless the developer opted in explicitly.
 */
export function assertPaymentsSafeForEnvironment(
  env: { NODE_ENV?: string; PAYMONGO_ALLOW_LIVE_IN_DEV?: string } = process.env,
  key: string | null = serverEnv.paymongo.secretKey,
): void {
  if (
    paymongoKeyMode(key) === 'live' &&
    env.NODE_ENV !== 'production' &&
    env.PAYMONGO_ALLOW_LIVE_IN_DEV !== '1'
  ) {
    throw new ServiceError(
      'Online payments are switched off in development because a LIVE PayMongo key is configured and a payment would charge real money. Use an sk_test_ key, or set PAYMONGO_ALLOW_LIVE_IN_DEV=1 to allow it.',
      'conflict',
    )
  }
}
