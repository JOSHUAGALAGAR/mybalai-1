import { beforeEach, describe, expect, it, vi } from 'vitest'

class PaymongoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    supabaseSecretKey: 'x',
    paymongo: { secretKey: 'sk', webhookSecret: 'wh' },
  },
  isPaymongoConfigured: () => true,
}))
vi.mock('@/lib/paymongo/client', () => ({
  PaymongoError,
  verifyWebhookSignature: vi.fn(),
  extractPaidPayment: vi.fn(),
  getCheckoutSession: vi.fn(),
  createCheckoutSession: vi.fn(),
}))
vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}))
vi.mock('@/repositories/paymongo.repository', () => ({
  claimEvent: vi.fn(),
  getPaymentBySession: vi.fn(),
  getOrderBySessionId: vi.fn(),
  getOrder: vi.fn(),
  markOrderPaid: vi.fn(),
  attachSessionToPayment: vi.fn(),
  attachSessionToOrder: vi.fn(),
  insertSubscriptionOrder: vi.fn(),
  setPaymentExpiry: vi.fn(),
  callSettleBookingPayment: vi.fn().mockResolvedValue('settled'),
  callFailBookingPayment: vi.fn().mockResolvedValue('failed'),
}))
vi.mock('@/repositories/payments.repository', () => ({
  getPayment: vi.fn(),
  callCreatePayment: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listPaymentStatuses: vi.fn().mockResolvedValue([
    { payment_status_id: 1, status_code: 'pending' },
    { payment_status_id: 2, status_code: 'paid' },
  ]),
  listBookingStatuses: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  getBooking: vi.fn(),
  callExpireOverdueBookings: vi.fn().mockResolvedValue(0),
}))
vi.mock('@/repositories/subscriptions.repository', () => ({
  getPlan: vi.fn(),
  upsertSubscription: vi.fn(),
}))
vi.mock('@/repositories/messaging.repository', () => ({ notify: vi.fn() }))

const client = await import('@/lib/paymongo/client')
const paymongoRepo = await import('@/repositories/paymongo.repository')
const paymentsRepo = await import('@/repositories/payments.repository')
const service = await import('@/services/paymongo.service')

const sig = vi.mocked(client.verifyWebhookSignature)
const extract = vi.mocked(client.extractPaidPayment)
const claim = vi.mocked(paymongoRepo.claimEvent)

function paidEvent(metadata: Record<string, string>) {
  return JSON.stringify({
    data: {
      id: 'evt_1',
      attributes: {
        type: 'checkout_session.payment.paid',
        data: {
          id: 'cs_1',
          type: 'checkout_session',
          attributes: { metadata },
        },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sig.mockReturnValue(true)
  claim.mockResolvedValue(true)
})

describe('handleWebhook', () => {
  it('rejects a bad signature', async () => {
    sig.mockReturnValue(false)
    await expect(service.handleWebhook('{}', 'x')).rejects.toMatchObject({
      status: 401,
    })
  })

  it('ignores an already-processed event', async () => {
    claim.mockResolvedValue(false)
    await service.handleWebhook(
      paidEvent({ kind: 'booking_payment', payment_id: '5' }),
      's',
    )
    expect(paymongoRepo.callSettleBookingPayment).not.toHaveBeenCalled()
  })

  it('does NOT settle on an amount mismatch', async () => {
    vi.mocked(paymentsRepo.getPayment).mockResolvedValue({
      payment_id: 5,
      payment_status_id: 1,
      amount: 8000,
      currency: 'PHP',
    } as never)
    extract.mockReturnValue({
      amountCentavos: 100,
      currency: 'PHP',
      paymongoPaymentId: 'pay_1',
    })
    await service.handleWebhook(
      paidEvent({ kind: 'booking_payment', payment_id: '5' }),
      's',
    )
    expect(paymongoRepo.callSettleBookingPayment).not.toHaveBeenCalled()
  })

  it('settles when the amount matches', async () => {
    vi.mocked(paymentsRepo.getPayment).mockResolvedValue({
      payment_id: 5,
      payment_status_id: 1,
      amount: 8000,
      currency: 'PHP',
    } as never)
    extract.mockReturnValue({
      amountCentavos: 800000,
      currency: 'PHP',
      paymongoPaymentId: 'pay_1',
    })
    await service.handleWebhook(
      paidEvent({ kind: 'booking_payment', payment_id: '5' }),
      's',
    )
    expect(paymongoRepo.callSettleBookingPayment).toHaveBeenCalledWith({
      p_payment: 5,
      p_paymongo_payment_id: 'pay_1',
    })
  })

  it('fails the payment on a failed event', async () => {
    const failed = JSON.stringify({
      data: {
        id: 'evt_2',
        attributes: {
          type: 'payment.failed',
          data: {
            id: 'cs_1',
            attributes: {
              metadata: { kind: 'booking_payment', payment_id: '7' },
            },
          },
        },
      },
    })
    await service.handleWebhook(failed, 's')
    expect(paymongoRepo.callFailBookingPayment).toHaveBeenCalledWith({
      p_payment: 7,
      p_reason: expect.any(String),
    })
  })
})
