import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Fetcher } from '@/lib/geocode/providers'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))

const { requireUser } = await import('@/lib/auth/dal')
const svc = await import('@/services/geocoding.service')

const asUser = (roles: string[], id = 1) =>
  vi.mocked(requireUser).mockResolvedValue({ legacyUserId: id, roles } as never)

const photon = (name: string) => ({
  ok: true,
  status: 200,
  json: async () => ({
    features: [
      {
        geometry: { coordinates: [120.6, 16.4] },
        properties: {
          countrycode: 'PH',
          osm_type: 'W',
          osm_id: 1,
          name,
          city: 'Baguio',
        },
      },
    ],
  }),
})

let n = 0
const fresh = () => `road ${++n}` // a query nobody searched before (the cache is module-wide)

beforeEach(() => vi.clearAllMocks())

describe('searchPlaces', () => {
  it('is for landlords and superadmins only', async () => {
    asUser(['tenant'])
    await expect(svc.searchPlaces(fresh(), vi.fn())).rejects.toMatchObject({
      code: 'forbidden',
    })
    asUser(['caretaker'])
    await expect(svc.searchPlaces(fresh(), vi.fn())).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('does not call the provider for a query shorter than 3 characters', async () => {
    asUser(['landlord'])
    const fetcher = vi.fn<Fetcher>()
    expect(await svc.searchPlaces('ab', fetcher)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('answers the same query from cache (one provider call)', async () => {
    asUser(['landlord'], 2)
    const fetcher = vi.fn<Fetcher>(async () => photon('Cached St'))
    const q = fresh()
    await svc.searchPlaces(q, fetcher)
    await svc.searchPlaces(`  ${q.toUpperCase()}  `, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('limits one user to 40 lookups a minute', async () => {
    asUser(['landlord'], 3)
    const fetcher = vi.fn<Fetcher>(async () => photon('X'))
    for (let i = 0; i < 40; i++) await svc.searchPlaces(fresh(), fetcher)
    await expect(svc.searchPlaces(fresh(), fetcher)).rejects.toMatchObject({
      code: 'conflict',
    })
    // …but another user is unaffected
    asUser(['landlord'], 4)
    await expect(svc.searchPlaces(fresh(), fetcher)).resolves.toHaveLength(1)
  })

  it('turns a provider outage into a friendly error that mentions the pin fallback', async () => {
    asUser(['landlord'], 5)
    const down = vi.fn<Fetcher>(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))
    await expect(svc.searchPlaces(fresh(), down)).rejects.toThrow(/drop a pin/i)
  })
})

describe('reversePlace', () => {
  it('rejects impossible coordinates', async () => {
    asUser(['landlord'], 6)
    await expect(svc.reversePlace(NaN, 120, vi.fn())).rejects.toMatchObject({
      code: 'validation',
    })
    await expect(svc.reversePlace(95, 120, vi.fn())).rejects.toMatchObject({
      code: 'validation',
    })
  })

  it('finds the address for a pin', async () => {
    asUser(['superadmin'], 7)
    const place = await svc.reversePlace(16.4001, 120.6001, async () =>
      photon('Pin Rd'),
    )
    expect(place?.label).toBe('Pin Rd, Baguio')
  })
})
