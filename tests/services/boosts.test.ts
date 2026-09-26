import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { boostState, daysLeft, isBoostLive } from '@/lib/boosts/rules'
import { boostPackageSchema } from '@/schemas/boosts'

vi.mock('@/lib/env.server', () => ({
  serverEnv: { paymongo: { secretKey: 'sk_live_x', webhookSecret: 'wh' } },
  isPaymongoConfigured: () => true,
}))
vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}))
vi.mock('@/repositories/boosts.repository', () => ({
  getPackage: vi.fn(),
  cancelPendingFor: vi.fn(),
  insertPending: vi.fn(),
  attachSession: vi.fn(),
  getBoost: vi.fn(),
  getBoostBySession: vi.fn(),
  listByLandlord: vi.fn(),
  callSettle: vi.fn(),
  listPackages: vi.fn(),
  insertPackage: vi.fn(),
  updatePackage: vi.fn(),
  liveBoostedPropertyIds: vi.fn(),
  cancelBoost: vi.fn(),
  expireEnded: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listPropertyStatuses: vi.fn().mockResolvedValue([
    { property_status_id: 1, status_code: 'active' },
    { property_status_id: 3, status_code: 'pending' },
  ]),
  listPaymentStatuses: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/paymongo.repository', () => ({}))
vi.mock('@/repositories/payments.repository', () => ({}))
vi.mock('@/repositories/bookings.repository', () => ({}))
vi.mock('@/repositories/messaging.repository', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/repositories/properties.repository', () => ({
  listProperties: vi.fn(),
}))
vi.mock('@/repositories/users.repository', () => ({}))
vi.mock('@/services/property-access', () => ({
  requireManageableProperty: vi.fn(),
}))
vi.mock('@/services/audit.service', () => ({ recordAudit: vi.fn() }))

const dal = await import('@/lib/auth/dal')
const repo = await import('@/repositories/boosts.repository')
const messaging = await import('@/repositories/messaging.repository')
const access = await import('@/services/property-access')
const audit = await import('@/services/audit.service')
const paymongo = await import('@/services/paymongo.service')
const boosts = await import('@/services/boosts.service')

const landlord = { legacyUserId: 5, roles: ['landlord'] }
const now = new Date('2026-09-26T04:00:00Z')

describe('boost rules', () => {
  const live = {
    status: 'active',
    starts_at: '2026-09-20T00:00:00Z',
    ends_at: '2026-10-05T00:00:00Z',
  }
  it('a boost is live only when paid, started and not ended', () => {
    expect(isBoostLive(live, now)).toBe(true)
    expect(isBoostLive({ ...live, status: 'pending' }, now)).toBe(false)
    expect(isBoostLive({ ...live, ends_at: '2026-09-25T00:00:00Z' }, now)).toBe(
      false,
    )
    expect(
      isBoostLive({ ...live, starts_at: '2026-10-01T00:00:00Z' }, now),
    ).toBe(false)
  })
  it('describes every state', () => {
    expect(boostState(live, now)).toBe('live')
    expect(
      boostState(
        {
          ...live,
          starts_at: '2026-10-01T00:00:00Z',
          ends_at: '2026-10-10T00:00:00Z',
        },
        now,
      ),
    ).toBe('queued')
    expect(boostState({ ...live, ends_at: '2026-09-01T00:00:00Z' }, now)).toBe(
      'ended',
    )
    expect(boostState({ ...live, status: 'pending' }, now)).toBe(
      'waiting_payment',
    )
    expect(boostState({ ...live, status: 'cancelled' }, now)).toBe('cancelled')
  })
  it('counts days left, rounding up', () => {
    expect(daysLeft('2026-09-26T07:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-10-06T04:00:00Z', now)).toBe(10)
    expect(daysLeft('2026-09-01T00:00:00Z', now)).toBe(0)
  })
})

describe('boostPackageSchema', () => {
  it('needs a name, days, and a price of at least ₱20', () => {
    expect(
      boostPackageSchema.safeParse({
        name: '7 days',
        days: '7',
        price: '99',
        is_active: 'on',
      }).success,
    ).toBe(true)
    expect(
      boostPackageSchema.safeParse({ name: '7 days', days: '7', price: '10' })
        .success,
    ).toBe(false)
    expect(
      boostPackageSchema.safeParse({ name: '7 days', days: '0', price: '99' })
        .success,
    ).toBe(false)
    expect(
      boostPackageSchema.safeParse({ name: '', days: '7', price: '99' })
        .success,
    ).toBe(false)
  })
})

describe('admin packages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dal.requireRole).mockResolvedValue({
      legacyUserId: 1,
      roles: ['superadmin'],
    } as never)
  })
  it('creates and updates a package and audits both', async () => {
    vi.mocked(repo.listPackages).mockResolvedValue([])
    vi.mocked(repo.insertPackage).mockResolvedValue({ package_id: 4 } as never)
    await boosts.savePackage(null, {
      name: '60 days',
      days: '60',
      price: '499',
      is_active: 'on',
    })
    expect(repo.insertPackage).toHaveBeenCalledWith(
      expect.objectContaining({ days: 60, price: 499, is_active: true }),
    )
    vi.mocked(repo.getPackage).mockResolvedValue({ package_id: 4 } as never)
    await boosts.savePackage(4, { name: '60 days', days: '60', price: '450' })
    expect(repo.updatePackage).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ price: 450, is_active: false }),
    )
    expect(audit.recordAudit).toHaveBeenCalledTimes(2)
  })
})

describe('liveBoostedIds', () => {
  it('never fails the page that asks (search results still show)', async () => {
    vi.mocked(repo.liveBoostedPropertyIds).mockRejectedValue(
      new Error('no table'),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(boosts.liveBoostedIds(now)).resolves.toEqual(new Set())
    spy.mockRestore()
  })
})

const ACTIVE_SESSION = {
  data: {
    id: 'cs_b',
    type: 'checkout_session',
    attributes: {
      status: 'active',
      checkout_url: 'https://pay.example/x',
      payments: [],
    },
  },
}
const stubFetch = (payments: unknown[] = [], captured?: { body?: unknown }) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST' && captured)
        captured.body = JSON.parse(init.body ?? '{}')
      if (url.includes('/checkout_sessions') && init?.method === 'POST')
        return new Response(JSON.stringify(ACTIVE_SESSION), { status: 200 })
      if (url.includes('/checkout_sessions/'))
        return new Response(JSON.stringify(ACTIVE_SESSION), { status: 200 })
      return new Response(JSON.stringify({ data: payments }), { status: 200 })
    }),
  )
}
afterEach(() => vi.unstubAllGlobals())

describe('startBoostCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dal.requireRole).mockResolvedValue(landlord as never)
    vi.mocked(repo.getPackage).mockResolvedValue({
      package_id: 2,
      name: '14 days',
      days: 14,
      price: 179,
      is_active: true,
    } as never)
    vi.mocked(access.requireManageableProperty).mockResolvedValue({
      user: landlord,
      property: {
        property_id: 9,
        property_name: 'Sunrise',
        property_owner: 5,
        status_id: 1,
      },
    } as never)
    vi.mocked(repo.insertPending).mockResolvedValue({ boost_id: 30 } as never)
  })

  it('creates a PENDING boost at the package price and sends the landlord to PayMongo', async () => {
    const captured: { body?: unknown } = {}
    stubFetch([], captured)
    const started = await paymongo.startBoostCheckout({
      propertyId: 9,
      packageId: 2,
    })
    expect(started).toEqual({
      checkoutUrl: 'https://pay.example/x',
      boostId: 30,
    })
    expect(repo.cancelPendingFor).toHaveBeenCalledWith(9)
    expect(repo.insertPending).toHaveBeenCalledWith({
      property_id: 9,
      landlord_id: 5,
      package_id: 2,
      days: 14,
      amount: 179,
    })
    expect(repo.attachSession).toHaveBeenCalledWith(30, 'cs_b')
    const sent = JSON.stringify(captured.body)
    expect(sent).toContain('17900') // centavos
    expect(sent).toContain('"boost_id":"30"')
    expect(sent).toContain('"kind":"boost"')
  })

  it('points at migration 0024 when the boost table cannot make an id', async () => {
    vi.mocked(repo.insertPending).mockRejectedValue(
      Object.assign(new Error('Failed to start the boost.'), {
        cause: {
          code: '23502',
          message:
            'null value in column "boost_id" of relation "property_boosts" violates not-null constraint',
        },
      }),
    )
    await expect(
      paymongo.startBoostCheckout({ propertyId: 9, packageId: 2 }),
    ).rejects.toThrow(/0024/)
  })

  it('lets the mobile app choose where PayMongo sends the landlord back', async () => {
    const captured: { body?: unknown } = {}
    stubFetch([], captured)
    await paymongo.startBoostCheckout({
      propertyId: 9,
      packageId: 2,
      urls: ({ boostId }) => ({
        successUrl: `https://bridge.example/ok?b=${boostId}`,
        cancelUrl: 'https://bridge.example/no',
      }),
    })
    const sent = JSON.stringify(captured.body)
    expect(sent).toContain('https://bridge.example/ok?b=30')
    expect(sent).toContain('https://bridge.example/no')
  })

  it('refuses an unavailable package and a property that is not approved', async () => {
    stubFetch()
    vi.mocked(repo.getPackage).mockResolvedValue({
      package_id: 2,
      is_active: false,
    } as never)
    await expect(
      paymongo.startBoostCheckout({ propertyId: 9, packageId: 2 }),
    ).rejects.toMatchObject({ code: 'not_found' })
    vi.mocked(repo.getPackage).mockResolvedValue({
      package_id: 2,
      name: 'x',
      days: 7,
      price: 99,
      is_active: true,
    } as never)
    vi.mocked(access.requireManageableProperty).mockResolvedValue({
      user: landlord,
      property: {
        property_id: 9,
        property_name: 'Sunrise',
        property_owner: 5,
        status_id: 3,
      },
    } as never)
    await expect(
      paymongo.startBoostCheckout({ propertyId: 9, packageId: 2 }),
    ).rejects.toMatchObject({ code: 'conflict', message: /approved/ })
    expect(repo.insertPending).not.toHaveBeenCalled()
  })
})

describe('reconcileMyPendingBoosts', () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    boost_id: 30,
    landlord_id: 5,
    amount: 179,
    status: 'pending',
    paymongo_session_id: 'cs_b',
    ...over,
  })
  const paid = (over: Record<string, unknown> = {}) => ({
    id: 'pay_b',
    type: 'payment',
    attributes: {
      status: 'paid',
      amount: 17900,
      currency: 'PHP',
      metadata: { boost_id: '30', kind: 'boost' },
      ...over,
    },
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dal.requireUser).mockResolvedValue(landlord as never)
    vi.mocked(repo.listByLandlord).mockResolvedValue([pending()] as never)
    vi.mocked(repo.getBoost).mockResolvedValue(pending() as never)
    vi.mocked(repo.callSettle).mockResolvedValue('settled')
  })

  it('activates a boost PayMongo already has as paid, and tells the landlord', async () => {
    stubFetch([paid()])
    await expect(paymongo.reconcileMyPendingBoosts()).resolves.toBe(1)
    expect(repo.callSettle).toHaveBeenCalledWith(30, 'pay_b')
    expect(messaging.notify).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 5, title: 'Boost active' }),
    )
  })

  it('ignores a payment for another boost, the wrong amount, or one that is not paid', async () => {
    stubFetch([
      paid({ metadata: { boost_id: '31' } }),
      paid({ amount: 9900 }),
      paid({ status: 'failed' }),
    ])
    await expect(paymongo.reconcileMyPendingBoosts()).resolves.toBe(0)
    expect(repo.callSettle).not.toHaveBeenCalled()
  })

  it('does not call PayMongo when nothing is waiting', async () => {
    vi.mocked(repo.listByLandlord).mockResolvedValue([
      pending({ status: 'active' }),
    ] as never)
    stubFetch([])
    await expect(paymongo.reconcileMyPendingBoosts()).resolves.toBe(0)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('does not tell the landlord twice when the database says it was already settled', async () => {
    vi.mocked(repo.callSettle).mockResolvedValue('already_settled')
    stubFetch([paid()])
    await paymongo.reconcileMyPendingBoosts()
    expect(messaging.notify).not.toHaveBeenCalled()
  })
})

describe('cancelBoost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dal.requireRole).mockResolvedValue({
      legacyUserId: 1,
      roles: ['superadmin'],
    } as never)
    vi.mocked(repo.getBoost).mockResolvedValue({
      boost_id: 30,
      landlord_id: 5,
    } as never)
    vi.mocked(repo.cancelBoost).mockResolvedValue(true)
  })
  it('stops the boost, records whether it was refunded, audits it and tells the landlord', async () => {
    await boosts.cancelBoost(30, {
      reason: 'Misleading photos',
      refunded: true,
    })
    expect(repo.cancelBoost).toHaveBeenCalledWith(30, {
      reason: 'Misleading photos',
      refunded: true,
    })
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'boost.cancelled' }),
    )
    expect(messaging.notify).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 5, title: 'Boost cancelled' }),
    )
  })
  it('needs a reason, and refuses a boost that is already over', async () => {
    await expect(boosts.cancelBoost(30, { reason: '' })).rejects.toMatchObject({
      code: 'validation',
    })
    vi.mocked(repo.cancelBoost).mockResolvedValue(false)
    await expect(
      boosts.cancelBoost(30, { reason: 'because' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})
