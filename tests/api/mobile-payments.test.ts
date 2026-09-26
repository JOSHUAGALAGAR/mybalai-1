import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// No PayMongo traffic: the service layer is mocked.
vi.mock('@/lib/auth/dal', () => ({
  getCurrentUser: vi.fn(),
  getSessionAuthMethods: vi.fn().mockResolvedValue(['password']),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))
vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    supabaseSecretKey: 'x',
    paymongo: { secretKey: 'sk_test_x', webhookSecret: null },
  },
  isPaymongoConfigured: () => true,
}))
vi.mock('@/services/paymongo.service', () => ({
  startBookingCheckout: vi.fn(),
  reconcilePayment: vi.fn(),
  reconcileMyPendingPayments: vi.fn().mockResolvedValue(0),
}))
vi.mock('@/services/payments.service', () => ({
  getMyPaymentSummary: vi.fn(),
  latestPaymentForMyBooking: vi.fn(),
}))
vi.mock('@/services/bookings.service', () => ({ getMyBooking: vi.fn() }))
vi.mock('@/services/mobile-messaging.service', () => ({
  listEligibleConversations: vi.fn().mockResolvedValue([]),
}))

const { getCurrentUser } = await import('@/lib/auth/dal')
const paymongo = await import('@/services/paymongo.service')
const payments = await import('@/services/payments.service')
const bookings = await import('@/services/bookings.service')
const pay = await import('@/app/api/mobile/bookings/[id]/pay/route')
const status = await import('@/app/api/mobile/payments/[id]/route')
const detail = await import('@/app/api/mobile/bookings/[id]/route')
const bridge = await import('@/app/pay/return/route')

const tenant = {
  authUserId: 'u',
  legacyUserId: 7,
  email: 't@x.com',
  fullName: 'T',
  phone: null,
  address: null,
  avatarUrl: null,
  isActive: true,
  roles: ['tenant'],
}

const payReq = (
  body: unknown,
  url = 'http://192.168.1.19:3000/api/mobile/bookings/99/pay',
) => new Request(url, { method: 'POST', body: JSON.stringify(body) })
const ctx = (id = '99') => ({ params: Promise.resolve({ id }) }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getCurrentUser).mockResolvedValue(tenant as never)
  vi.mocked(paymongo.startBookingCheckout).mockResolvedValue({
    checkoutUrl: 'https://checkout.paymongo.com/cs_1',
    paymentId: 555,
    bookingId: 99,
  })
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/mobile/bookings/[id]/pay', () => {
  it('starts checkout and returns the URL + payment id', async () => {
    const res = await pay.POST(
      payReq({ returnUrl: 'mybalaimobile://payment-return' }),
      ctx(),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      checkoutUrl: 'https://checkout.paymongo.com/cs_1',
      paymentId: 555,
    })
    expect(paymongo.startBookingCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 99, reusePending: true }),
    )
  })

  it('builds bridge return URLs on the address the phone reached us on (dev)', async () => {
    await pay.POST(
      payReq({ returnUrl: 'exp://192.168.1.19:8081/--/payment-return' }),
      ctx(),
    )
    const { urls } = vi.mocked(paymongo.startBookingCheckout).mock.calls[0][0]
    const { successUrl, cancelUrl } = urls!({ paymentId: 555, bookingId: 99 })
    const ok = new URL(successUrl)
    expect(ok.origin).toBe('http://192.168.1.19:3000')
    expect(ok.pathname).toBe('/pay/return')
    expect(ok.searchParams.get('to')).toBe(
      'exp://192.168.1.19:8081/--/payment-return',
    )
    expect(ok.searchParams.get('result')).toBe('success')
    expect(new URL(cancelUrl).searchParams.get('result')).toBe('cancelled')
  })

  it('uses the configured site URL, not request headers, in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mybalai.example')
    await pay.POST(
      payReq(
        { returnUrl: 'mybalaimobile://payment-return' },
        'http://evil-host/api/mobile/bookings/99/pay',
      ),
      ctx(),
    )
    const { urls } = vi.mocked(paymongo.startBookingCheckout).mock.calls[0][0]
    expect(
      new URL(urls!({ paymentId: 1, bookingId: 99 }).successUrl).origin,
    ).toBe('https://mybalai.example')
  })

  it.each([
    ['a web address', 'https://evil.example/steal'],
    ['javascript:', 'javascript:alert(1)'],
    ['a foreign app scheme', 'otherapp://x'],
  ])(
    'rejects %s as a return address (422) and never starts checkout',
    async (_l, returnUrl) => {
      const res = await pay.POST(payReq({ returnUrl }), ctx())
      expect(res.status).toBe(422)
      expect(paymongo.startBookingCheckout).not.toHaveBeenCalled()
    },
  )

  it('rejects Expo Go addresses in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mybalai.example')
    const res = await pay.POST(
      payReq({ returnUrl: 'exp://192.168.1.19:8081/--/payment-return' }),
      ctx(),
    )
    expect(res.status).toBe(422)
  })

  it('ignores any amount the client sends — checkout is only ever asked for the booking id', async () => {
    await pay.POST(
      payReq({
        returnUrl: 'mybalaimobile://payment-return',
        amount: 1,
        total: 1,
      }),
      ctx(),
    )
    const arg = vi.mocked(paymongo.startBookingCheckout).mock
      .calls[0][0] as Record<string, unknown>
    expect(Object.keys(arg).sort()).toEqual([
      'bookingId',
      'reusePending',
      'urls',
    ])
  })

  it('needs a signed-in tenant', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    expect(
      (
        await pay.POST(
          payReq({ returnUrl: 'mybalaimobile://payment-return' }),
          ctx(),
        )
      ).status,
    ).toBe(401)
    vi.mocked(getCurrentUser).mockResolvedValue({
      ...tenant,
      roles: ['landlord'],
    } as never)
    expect(
      (
        await pay.POST(
          payReq({ returnUrl: 'mybalaimobile://payment-return' }),
          ctx(),
        )
      ).status,
    ).toBe(403)
    expect(paymongo.startBookingCheckout).not.toHaveBeenCalled()
  })

  it('rejects a bad booking id and a missing body', async () => {
    expect(
      (await pay.POST(payReq({ returnUrl: 'mybalaimobile://x' }), ctx('abc')))
        .status,
    ).toBe(404)
    expect((await pay.POST(payReq({}), ctx())).status).toBe(422)
  })

  it('passes a service refusal through as a readable error', async () => {
    const { ServiceError } = await import('@/services/errors')
    vi.mocked(paymongo.startBookingCheckout).mockRejectedValue(
      new ServiceError('The payment window has closed.', 'conflict'),
    )
    const res = await pay.POST(
      payReq({ returnUrl: 'mybalaimobile://payment-return' }),
      ctx(),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toBe(
      'The payment window has closed.',
    )
  })
})

describe('GET /api/mobile/payments/[id]', () => {
  it('reconciles with PayMongo, then returns the summary with the reconciled status', async () => {
    vi.mocked(paymongo.reconcilePayment).mockResolvedValue({ status: 'paid' })
    vi.mocked(payments.getMyPaymentSummary).mockResolvedValue({
      paymentId: 555,
      bookingId: 99,
      statusCode: 'paid',
      statusName: 'Paid',
      amount: 4500,
      currency: 'PHP',
      paidAt: '2026-09-25T00:00:00Z',
    })
    const res = await status.GET(
      new Request('http://x/api/mobile/payments/555'),
      ctx('555'),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({
      paymentId: 555,
      status: 'paid',
      amount: 4500,
    })
    expect(paymongo.reconcilePayment).toHaveBeenCalledWith(555)
  })

  it("does not reveal another tenant's payment", async () => {
    const { ServiceError } = await import('@/services/errors')
    vi.mocked(paymongo.reconcilePayment).mockRejectedValue(
      new ServiceError('Payment not found.', 'not_found'),
    )
    const res = await status.GET(
      new Request('http://x/api/mobile/payments/1'),
      ctx('1'),
    )
    expect(res.status).toBe(404)
    expect(payments.getMyPaymentSummary).not.toHaveBeenCalled()
  })
})

describe('GET /api/mobile/bookings/[id] (payment fields)', () => {
  it('adds the latest payment and whether online payments are available, without internal ids', async () => {
    vi.mocked(bookings.getMyBooking).mockResolvedValue({
      bookingId: 99,
      tenantId: 7,
      propertyOwnerId: 3,
      needsPayment: true,
      statusCode: 'payment_pending',
    } as never)
    vi.mocked(payments.latestPaymentForMyBooking).mockResolvedValue({
      paymentId: 555,
      bookingId: 99,
      statusCode: 'pending',
      statusName: 'Pending',
      amount: 4500,
      currency: 'PHP',
      paidAt: null,
    })
    const res = await detail.GET(
      new Request('http://x/api/mobile/bookings/99'),
      ctx(),
    )
    const data = (await res.json()).data
    expect(data.payment).toMatchObject({
      paymentId: 555,
      statusCode: 'pending',
    })
    expect(data.onlinePaymentsAvailable).toBe(true)
    expect(data).not.toHaveProperty('tenantId')
    expect(data).not.toHaveProperty('propertyOwnerId')
  })

  it('asks PayMongo about pending payments first, so a paid booking stops saying "payment pending"', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(tenant as never)
    vi.mocked(bookings.getMyBooking).mockResolvedValue({
      bookingId: 99,
      propertyId: 1,
      propertyOwnerId: 5,
    } as never)
    vi.mocked(payments.latestPaymentForMyBooking).mockResolvedValue(null)
    await detail.GET(
      new Request('http://x/api/mobile/bookings/99', {
        headers: { authorization: 'Bearer t' },
      }),
      ctx(),
    )
    expect(paymongo.reconcileMyPendingPayments).toHaveBeenCalled()
  })
})

describe('GET /pay/return (bridge into the app)', () => {
  const url = (q: Record<string, string>) =>
    `https://mybalai.example/pay/return?${new URLSearchParams(q)}`
  const good = {
    to: 'mybalaimobile://payment-return',
    payment: '555',
    booking: '99',
    result: 'success',
  }

  it('302s to the app with the payment details', async () => {
    const res = bridge.GET(new Request(url(good)))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'mybalaimobile://payment-return?payment=555&booking=99&result=success',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('carries the cancelled result too', async () => {
    const res = bridge.GET(new Request(url({ ...good, result: 'cancelled' })))
    expect(res.headers.get('location')).toContain('result=cancelled')
  })

  it.each([
    ['an https target (open redirect)', { to: 'https://evil.example/phish' }],
    ['a javascript: target', { to: 'javascript:alert(1)' }],
    ['a foreign app scheme', { to: 'otherapp://x' }],
    ['a missing target', { to: '' }],
    ['a non-numeric payment id', { payment: 'abc' }],
    ['a zero booking id', { booking: '0' }],
    ['an unknown result', { result: 'paid' }],
  ])('refuses %s with a 400 and never redirects', (_label, override) => {
    const res = bridge.GET(new Request(url({ ...good, ...override })))
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('refuses Expo Go targets in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = bridge.GET(
      new Request(
        url({ ...good, to: 'exp://192.168.1.19:8081/--/payment-return' }),
      ),
    )
    expect(res.status).toBe(400)
  })
})
