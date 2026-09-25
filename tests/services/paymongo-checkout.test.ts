import { beforeEach, describe, expect, it, vi } from 'vitest'

// NOTHING here talks to PayMongo: the client is mocked, so no real (or test) checkout is created.
class PaymongoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

const configured = vi.fn(() => true)
vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    supabaseSecretKey: 'x',
    paymongo: { secretKey: 'sk', webhookSecret: 'wh' },
  },
  isPaymongoConfigured: () => configured(),
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
vi.mock('@/lib/permissions/properties', () => ({
  isSuperadmin: (u: { roles: string[] }) => u.roles.includes('superadmin'),
}))
vi.mock('@/repositories/paymongo.repository', () => ({
  claimEvent: vi.fn(),
  getPaymentBySession: vi.fn(),
  getOrderBySessionId: vi.fn(),
  getOrder: vi.fn(),
  markOrderPaid: vi.fn(),
  attachSessionToPayment: vi.fn().mockResolvedValue(undefined),
  attachSessionToOrder: vi.fn(),
  insertSubscriptionOrder: vi.fn(),
  setPaymentExpiry: vi.fn().mockResolvedValue(undefined),
  callSettleBookingPayment: vi.fn(),
  callFailBookingPayment: vi.fn(),
}))
vi.mock('@/repositories/payments.repository', () => ({
  getPayment: vi.fn(),
  callCreatePayment: vi.fn(),
  listPaymentsByBookings: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listPaymentStatuses: vi.fn().mockResolvedValue([
    { payment_status_id: 1, status_code: 'pending' },
    { payment_status_id: 2, status_code: 'paid' },
  ]),
  listBookingStatuses: vi.fn().mockResolvedValue([
    { booking_status_id: 10, status_code: 'payment_pending' },
    { booking_status_id: 11, status_code: 'confirmed' },
  ]),
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

const { requireUser } = await import('@/lib/auth/dal')
const client = await import('@/lib/paymongo/client')
const paymongoRepo = await import('@/repositories/paymongo.repository')
const paymentsRepo = await import('@/repositories/payments.repository')
const bookingsRepo = await import('@/repositories/bookings.repository')
const service = await import('@/services/paymongo.service')

const tenant = { legacyUserId: 7, roles: ['tenant'] }
const createSession = vi.mocked(client.createCheckoutSession)

const booking = (over: Record<string, unknown> = {}) => ({
  booking_id: 99,
  user_id: 7,
  booking_status_id: 10,
  total_amount: 4500,
  payment_due_at: new Date(Date.now() + 3_600_000).toISOString(),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  configured.mockReturnValue(true)
  vi.mocked(requireUser).mockResolvedValue(tenant as never)
  vi.mocked(bookingsRepo.getBooking).mockResolvedValue(booking() as never)
  vi.mocked(paymentsRepo.callCreatePayment).mockResolvedValue(555 as never)
  vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([])
  createSession.mockResolvedValue({
    id: 'cs_1',
    checkoutUrl: 'https://checkout.paymongo.com/cs_1',
    status: 'active',
    paymentIntentId: null,
    raw: {},
  })
})

describe('startBookingCheckout', () => {
  it("charges the booking's own total (never a client amount) and uses the caller's return URLs", async () => {
    const urls = vi.fn(({ paymentId, bookingId }) => ({
      successUrl: `https://site/pay/return?p=${paymentId}&b=${bookingId}&r=success`,
      cancelUrl: `https://site/pay/return?p=${paymentId}&b=${bookingId}&r=cancelled`,
    }))
    const started = await service.startBookingCheckout({ bookingId: 99, urls })

    expect(started).toEqual({
      checkoutUrl: 'https://checkout.paymongo.com/cs_1',
      paymentId: 555,
      bookingId: 99,
    })
    expect(urls).toHaveBeenCalledWith({ paymentId: 555, bookingId: 99 })
    const sent = createSession.mock.calls[0][0]
    expect(sent.amountPhp).toBe(4500)
    expect(sent.successUrl).toBe('https://site/pay/return?p=555&b=99&r=success')
    expect(sent.cancelUrl).toBe(
      'https://site/pay/return?p=555&b=99&r=cancelled',
    )
    expect(sent.metadata).toMatchObject({
      kind: 'booking_payment',
      payment_id: '555',
      booking_id: '99',
    })
    expect(paymongoRepo.attachSessionToPayment).toHaveBeenCalledWith(
      555,
      'cs_1',
    )
  })

  it('keeps the website return pages when no urls are given', async () => {
    await service.startBookingCheckout({ bookingId: 99 })
    const sent = createSession.mock.calls[0][0]
    expect(sent.successUrl).toMatch(/\/payments\/555\?paid=1$/)
    expect(sent.cancelUrl).toMatch(/\/bookings\/99$/)
  })

  it('startPaymentCheckout (website) still returns just the URL', async () => {
    await expect(service.startPaymentCheckout({ bookingId: 99 })).resolves.toBe(
      'https://checkout.paymongo.com/cs_1',
    )
  })

  it('creates a payment record and stores its expiry when nothing is pending', async () => {
    await service.startBookingCheckout({ bookingId: 99, reusePending: true })
    expect(paymentsRepo.callCreatePayment).toHaveBeenCalledOnce()
    expect(paymongoRepo.setPaymentExpiry).toHaveBeenCalledWith(
      555,
      expect.any(String),
    )
  })

  it('reuses an unfinished payment instead of creating a duplicate', async () => {
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      { payment_id: 321, user_id: 7, payment_status_id: 1 } as never,
    ])
    const started = await service.startBookingCheckout({
      bookingId: 99,
      reusePending: true,
    })
    expect(started.paymentId).toBe(321)
    expect(paymentsRepo.callCreatePayment).not.toHaveBeenCalled()
    expect(paymongoRepo.setPaymentExpiry).not.toHaveBeenCalled()
    expect(paymongoRepo.attachSessionToPayment).toHaveBeenCalledWith(
      321,
      'cs_1',
    )
  })

  it('does not reuse a settled payment or someone else’s pending payment', async () => {
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      { payment_id: 1, user_id: 7, payment_status_id: 2 } as never, // paid
      { payment_id: 2, user_id: 8, payment_status_id: 1 } as never, // other user
    ])
    const started = await service.startBookingCheckout({
      bookingId: 99,
      reusePending: true,
    })
    expect(started.paymentId).toBe(555)
    expect(paymentsRepo.callCreatePayment).toHaveBeenCalledOnce()
  })

  it('creates a fresh record every time when reuse is not requested (website behaviour)', async () => {
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      { payment_id: 321, user_id: 7, payment_status_id: 1 } as never,
    ])
    await service.startBookingCheckout({ bookingId: 99 })
    expect(paymentsRepo.callCreatePayment).toHaveBeenCalledOnce()
  })
})

describe('startBookingCheckout guards', () => {
  it("refuses someone else's booking", async () => {
    vi.mocked(bookingsRepo.getBooking).mockResolvedValue(
      booking({ user_id: 8 }) as never,
    )
    await expect(
      service.startBookingCheckout({ bookingId: 99 }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses a booking that is not awaiting payment', async () => {
    vi.mocked(bookingsRepo.getBooking).mockResolvedValue(
      booking({ booking_status_id: 11 }) as never,
    )
    await expect(
      service.startBookingCheckout({ bookingId: 99 }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses once the payment window has closed', async () => {
    vi.mocked(bookingsRepo.getBooking).mockResolvedValue(
      booking({
        payment_due_at: new Date(Date.now() - 1000).toISOString(),
      }) as never,
    )
    await expect(
      service.startBookingCheckout({ bookingId: 99 }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('refuses when online payments are not configured', async () => {
    configured.mockReturnValue(false)
    await expect(
      service.startBookingCheckout({ bookingId: 99 }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('turns a PayMongo failure into a readable error', async () => {
    createSession.mockRejectedValue(
      new PaymongoError(
        'PayMongo POST /checkout_sessions failed (400): bad method',
        400,
      ),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      service.startBookingCheckout({ bookingId: 99 }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('bad method'),
    })
  })
})
