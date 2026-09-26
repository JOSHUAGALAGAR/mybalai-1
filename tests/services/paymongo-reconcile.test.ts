import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env.server', () => ({
  serverEnv: { paymongo: { secretKey: 'sk_live_x', webhookSecret: 'wh' } },
  isPaymongoConfigured: () => true,
}))
vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi
    .fn()
    .mockResolvedValue({ legacyUserId: 7, roles: ['tenant'] }),
  requireRole: vi.fn(),
}))
vi.mock('@/repositories/paymongo.repository', () => ({
  callSettleBookingPayment: vi.fn().mockResolvedValue('settled'),
}))
vi.mock('@/repositories/payments.repository', () => ({
  getPayment: vi.fn(),
  listPaymentsByUser: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listPaymentStatuses: vi.fn().mockResolvedValue([
    { payment_status_id: 1, status_code: 'pending' },
    { payment_status_id: 2, status_code: 'paid' },
  ]),
}))
vi.mock('@/repositories/bookings.repository', () => ({}))
vi.mock('@/repositories/messaging.repository', () => ({ notify: vi.fn() }))
vi.mock('@/repositories/subscriptions.repository', () => ({}))

const paymongoRepo = await import('@/repositories/paymongo.repository')
const paymentsRepo = await import('@/repositories/payments.repository')
const service = await import('@/services/paymongo.service')

const row = (over: Record<string, unknown> = {}) => ({
  payment_id: 20,
  booking_id: 20,
  user_id: 7,
  amount: 20,
  currency: 'PHP',
  payment_status_id: 1,
  paymongo_session_id: 'cs_1',
  ...over,
})

/** What PayMongo really answers for a QR Ph payment: the session is still "active"... */
const ACTIVE_SESSION = {
  data: {
    id: 'cs_1',
    type: 'checkout_session',
    attributes: {
      status: 'active',
      payments: [],
      payment_intent: {
        id: 'pi_1',
        attributes: { status: 'awaiting_payment_method' },
      },
    },
  },
}
/** ...while the payment itself is paid and carries the metadata we sent. */
const paidPayment = (over: Record<string, unknown> = {}) => ({
  id: 'pay_1',
  type: 'payment',
  attributes: {
    status: 'paid',
    amount: 2000,
    currency: 'PHP',
    metadata: { payment_id: '20', booking_id: '20' },
    ...over,
  },
})

function stubPaymongo(payments: unknown[], session: unknown = ACTIVE_SESSION) {
  const fetchMock = vi.fn(async (url: string) => {
    const body = url.includes('/checkout_sessions/')
      ? session
      : { data: payments }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(paymentsRepo.getPayment).mockResolvedValue(row() as never)
})
afterEach(() => vi.unstubAllGlobals())

describe('reconcilePayment — a QR Ph payment the session does not show', () => {
  it('settles it from the payments list', async () => {
    stubPaymongo([paidPayment()])
    await expect(service.reconcilePayment(20)).resolves.toEqual({
      status: 'paid',
    })
    expect(paymongoRepo.callSettleBookingPayment).toHaveBeenCalledWith({
      p_payment: 20,
      p_paymongo_payment_id: 'pay_1',
    })
  })

  it('does not settle for another payment, a different amount, or an unpaid one', async () => {
    stubPaymongo([
      paidPayment({ metadata: { payment_id: '21' } }), // someone else's
      paidPayment({ amount: 1999 }), // wrong amount
      paidPayment({ status: 'failed' }), // not paid
      {
        id: 'pay_2',
        type: 'payment',
        attributes: { status: 'paid', amount: 2000, currency: 'PHP' },
      }, // no metadata
    ])
    await expect(service.reconcilePayment(20)).resolves.toEqual({
      status: 'pending',
    })
    expect(paymongoRepo.callSettleBookingPayment).not.toHaveBeenCalled()
  })

  it('stays pending (not an error) when the payments list cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/checkout_sessions/')
          ? new Response(JSON.stringify(ACTIVE_SESSION), { status: 200 })
          : new Response('{}', { status: 500 }),
      ),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(service.reconcilePayment(20)).resolves.toEqual({
      status: 'pending',
    })
    spy.mockRestore()
  })
})

describe('reconcileMyPendingPayments', () => {
  it('settles every pending payment PayMongo has as paid, with ONE PayMongo call', async () => {
    vi.mocked(paymentsRepo.listPaymentsByUser).mockResolvedValue([
      row(),
      row({ payment_id: 21, booking_id: 21, amount: 50 }),
      row({ payment_id: 5, payment_status_id: 2 }), // already paid: ignored
      row({ payment_id: 6, paymongo_session_id: null }), // manual payment: ignored
    ] as never)
    const fetchMock = stubPaymongo(
      [
        paidPayment(),
        paidPayment({ amount: 5000, metadata: { payment_id: '21' } }),
      ].map((p, i) => ({ ...p, id: `pay_${i}` })),
    )
    await expect(service.reconcileMyPendingPayments()).resolves.toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(paymongoRepo.callSettleBookingPayment).toHaveBeenCalledTimes(2)
  })

  it('does not call PayMongo at all when nothing is waiting', async () => {
    vi.mocked(paymentsRepo.listPaymentsByUser).mockResolvedValue([
      row({ payment_status_id: 2 }),
    ] as never)
    const fetchMock = stubPaymongo([])
    await expect(service.reconcileMyPendingPayments()).resolves.toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws, so the bookings screen still loads', async () => {
    vi.mocked(paymentsRepo.listPaymentsByUser).mockRejectedValue(
      new Error('db down'),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(service.reconcileMyPendingPayments()).resolves.toBe(0)
    spy.mockRestore()
  })
})
