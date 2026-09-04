import { describe, expect, it } from 'vitest'

import { extractPaidPayment } from '@/lib/paymongo/client'
import { checkoutSessionIsPaid, mapPaymongoEvent } from '@/lib/paymongo/status'

describe('mapPaymongoEvent', () => {
  it('maps paid / failed / other', () => {
    expect(mapPaymongoEvent('checkout_session.payment.paid')).toBe('paid')
    expect(mapPaymongoEvent('payment.failed')).toBe('failed')
    expect(mapPaymongoEvent('source.chargeable')).toBe('ignore')
    expect(mapPaymongoEvent(null)).toBe('ignore')
  })
})

describe('checkoutSessionIsPaid', () => {
  it('true when a nested payment is paid', () => {
    expect(
      checkoutSessionIsPaid({
        attributes: { payments: [{ attributes: { status: 'paid' } }] },
      }),
    ).toBe(true)
  })
  it('true when the intent succeeded', () => {
    expect(
      checkoutSessionIsPaid({
        attributes: { payment_intent: { attributes: { status: 'succeeded' } } },
      }),
    ).toBe(true)
  })
  it('false otherwise', () => {
    expect(checkoutSessionIsPaid({ attributes: { payments: [] } })).toBe(false)
  })
})

describe('extractPaidPayment', () => {
  it('reads amount/currency/id from a checkout session', () => {
    const r = extractPaidPayment({
      id: 'cs_1',
      type: 'checkout_session',
      attributes: {
        payments: [
          {
            id: 'pay_9',
            attributes: { status: 'paid', amount: 800000, currency: 'PHP' },
          },
        ],
      },
    })
    expect(r).toEqual({
      amountCentavos: 800000,
      currency: 'PHP',
      paymongoPaymentId: 'pay_9',
    })
  })

  it('returns null when nothing is paid', () => {
    expect(
      extractPaidPayment({
        type: 'checkout_session',
        attributes: { payments: [] },
      }),
    ).toBeNull()
  })
})
