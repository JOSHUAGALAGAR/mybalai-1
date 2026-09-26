import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  getCurrentUser: vi.fn(),
  getSessionAuthMethods: vi.fn().mockResolvedValue(['password']),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))
vi.mock('@/lib/env.server', () => ({
  serverEnv: { paymongo: { secretKey: 'sk_test_x', webhookSecret: null } },
  isPaymongoConfigured: () => true,
}))
vi.mock('@/lib/paymongo/mode', () => ({
  assertPaymentsSafeForEnvironment: vi.fn(),
}))
vi.mock('@/services/boosts.service', () => ({ getMyBoosts: vi.fn() }))
vi.mock('@/services/paymongo.service', () => ({ startBoostCheckout: vi.fn() }))

const { getCurrentUser } = await import('@/lib/auth/dal')
const boosts = await import('@/services/boosts.service')
const paymongo = await import('@/services/paymongo.service')
const route = await import('@/app/api/mobile/landlord/boosts/route')

const person = (roles: string[]) => ({
  authUserId: 'u',
  legacyUserId: 100,
  email: 'l@x.com',
  fullName: 'L',
  phone: null,
  address: null,
  avatarUrl: null,
  isActive: true,
  roles,
})
const post = (body: unknown) =>
  new Request('http://192.168.1.19:3000/api/mobile/landlord/boosts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
const ctx = { params: Promise.resolve({}) } as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getCurrentUser).mockResolvedValue(person(['landlord']) as never)
})

describe('GET /api/mobile/landlord/boosts', () => {
  it('returns packages, boostable properties and boosts', async () => {
    vi.mocked(boosts.getMyBoosts).mockResolvedValue({
      packages: [{ packageId: 1 }],
      properties: [],
      boosts: [],
    } as never)
    const res = await route.GET(
      new Request('http://x/api/mobile/landlord/boosts'),
      ctx,
    )
    const data = (await res.json()).data
    expect(data.packages).toHaveLength(1)
    expect(data.onlinePaymentsAvailable).toBe(true)
  })
  it('refuses a tenant', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(person(['tenant']) as never)
    const res = await route.GET(
      new Request('http://x/api/mobile/landlord/boosts'),
      ctx,
    )
    expect(res.status).toBe(403)
    expect(boosts.getMyBoosts).not.toHaveBeenCalled()
  })
})

describe('POST /api/mobile/landlord/boosts', () => {
  it('starts checkout with the app return address behind the bridge, and returns the payment link', async () => {
    vi.mocked(paymongo.startBoostCheckout).mockImplementation((async (input: {
      urls: (i: { boostId: number }) => {
        successUrl: string
        cancelUrl: string
      }
    }) => {
      const urls = input.urls({ boostId: 30 })
      expect(urls.successUrl).toContain('/pay/return')
      expect(urls.successUrl).toContain('result=success')
      expect(urls.cancelUrl).toContain('result=cancelled')
      return { checkoutUrl: 'https://pay.example/x', boostId: 30 }
    }) as never)
    const res = await route.POST(
      post({
        propertyId: 9,
        packageId: 2,
        returnUrl: 'mybalaimobile://boost-return',
      }),
      ctx,
    )
    expect((await res.json()).data).toEqual({
      checkoutUrl: 'https://pay.example/x',
      boostId: 30,
    })
    expect(
      vi.mocked(paymongo.startBoostCheckout).mock.calls[0][0],
    ).toMatchObject({ propertyId: 9, packageId: 2 })
  })

  it('never takes a price from the app, and rejects a return address that is not the app (open-redirect guard)', async () => {
    const res = await route.POST(
      post({
        propertyId: 9,
        packageId: 2,
        returnUrl: 'https://evil.example/steal',
      }),
      ctx,
    )
    expect(res.status).toBe(422)
    expect(paymongo.startBoostCheckout).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    const res = await route.POST(
      post({
        propertyId: 'nine',
        packageId: 2,
        returnUrl: 'mybalaimobile://x',
      }),
      ctx,
    )
    expect(res.status).toBe(422)
  })
})
