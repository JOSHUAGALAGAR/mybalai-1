import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    supabaseSecretKey: 'x',
    paymongo: { secretKey: null, webhookSecret: null },
  },
}))

const { assertPaymentsSafeForEnvironment, paymongoKeyMode } =
  await import('@/lib/paymongo/mode')

describe('paymongoKeyMode', () => {
  it('classifies keys', () => {
    expect(paymongoKeyMode('sk_live_abc')).toBe('live')
    expect(paymongoKeyMode('sk_test_abc')).toBe('test')
    expect(paymongoKeyMode('pk_live_abc')).toBe('unknown')
    expect(paymongoKeyMode('')).toBe('unset')
    expect(paymongoKeyMode(null)).toBe('unset')
  })
})

describe('assertPaymentsSafeForEnvironment', () => {
  it('blocks a LIVE key in development', () => {
    expect(() =>
      assertPaymentsSafeForEnvironment(
        { NODE_ENV: 'development' },
        'sk_live_x',
      ),
    ).toThrow(/LIVE PayMongo key/)
  })
  it('allows a live key when explicitly opted in, or in production', () => {
    expect(() =>
      assertPaymentsSafeForEnvironment(
        { NODE_ENV: 'development', PAYMONGO_ALLOW_LIVE_IN_DEV: '1' },
        'sk_live_x',
      ),
    ).not.toThrow()
    expect(() =>
      assertPaymentsSafeForEnvironment({ NODE_ENV: 'production' }, 'sk_live_x'),
    ).not.toThrow()
  })
  it('never blocks a test key', () => {
    expect(() =>
      assertPaymentsSafeForEnvironment(
        { NODE_ENV: 'development' },
        'sk_test_x',
      ),
    ).not.toThrow()
  })
  it('does not treat the override as truthy for other values', () => {
    expect(() =>
      assertPaymentsSafeForEnvironment(
        { NODE_ENV: 'development', PAYMONGO_ALLOW_LIVE_IN_DEV: 'true' },
        'sk_live_x',
      ),
    ).toThrow()
  })
})
