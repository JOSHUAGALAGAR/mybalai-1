import { describe, expect, it } from 'vitest'

import {
  createPaymentSchema,
  paymentDecisionSchema,
  paymentNoteSchema,
} from '@/schemas/payment'

describe('createPaymentSchema', () => {
  const ok = { booking_id: '12', amount: '8000', method_code: 'gcash' }
  it('accepts a valid payment', () => {
    expect(createPaymentSchema.safeParse(ok).success).toBe(true)
  })
  it('rejects zero / negative amounts', () => {
    expect(createPaymentSchema.safeParse({ ...ok, amount: '0' }).success).toBe(
      false,
    )
    expect(createPaymentSchema.safeParse({ ...ok, amount: '-5' }).success).toBe(
      false,
    )
  })
  it('rejects a missing method or booking', () => {
    expect(
      createPaymentSchema.safeParse({ ...ok, method_code: '' }).success,
    ).toBe(false)
    expect(
      createPaymentSchema.safeParse({ ...ok, booking_id: '0' }).success,
    ).toBe(false)
  })
  it('coerces blank optionals to undefined', () => {
    const r = createPaymentSchema.safeParse({
      ...ok,
      reference_number: '  ',
      paid_at: '',
    })
    expect(r.success && r.data.reference_number).toBeUndefined()
    expect(r.success && r.data.paid_at).toBeUndefined()
  })
})

describe('paymentDecisionSchema', () => {
  it('accepts paid / rejected', () => {
    expect(paymentDecisionSchema.safeParse({ to: 'paid' }).success).toBe(true)
    expect(paymentDecisionSchema.safeParse({ to: 'rejected' }).success).toBe(
      true,
    )
  })
  it('rejects anything else', () => {
    expect(paymentDecisionSchema.safeParse({ to: 'cancelled' }).success).toBe(
      false,
    )
    expect(paymentDecisionSchema.safeParse({ to: 'verified' }).success).toBe(
      false,
    )
  })
})

describe('paymentNoteSchema', () => {
  it('requires non-empty text', () => {
    expect(paymentNoteSchema.safeParse({ note: 'ok' }).success).toBe(true)
    expect(paymentNoteSchema.safeParse({ note: '   ' }).success).toBe(false)
  })
})
