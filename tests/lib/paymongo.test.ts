import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The client reads the webhook secret from serverEnv at call time.
vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    supabaseSecretKey: 'x',
    paymongo: { secretKey: null, webhookSecret: 'whsec_test' },
  },
  isPaymongoConfigured: () => false,
}))

const { verifyWebhookSignature } = await import('@/lib/paymongo/client')

function sign(body: string, ts: string, secret = 'whsec_test'): string {
  return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
}

describe('verifyWebhookSignature', () => {
  const body = '{"data":{"id":"evt_1"}}'
  const ts = '1700000000'

  beforeEach(() => vi.clearAllMocks())

  it('accepts a correct test signature', () => {
    const header = `t=${ts},te=${sign(body, ts)},li=deadbeef`
    expect(verifyWebhookSignature(body, header)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const header = `t=${ts},te=${sign(body, ts)}`
    expect(verifyWebhookSignature(body + ' ', header)).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const header = `t=${ts},te=${sign(body, ts, 'nope')}`
    expect(verifyWebhookSignature(body, header)).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(verifyWebhookSignature(body, null)).toBe(false)
  })
})
