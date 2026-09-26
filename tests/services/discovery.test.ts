import { beforeEach, describe, expect, it, vi } from 'vitest'

import { discoveryQuerySchema } from '@/schemas/discovery'

vi.mock('@/services/boosts.service', () => ({
  liveBoostedIds: vi.fn().mockResolvedValue(new Set<number>()),
}))
vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/discovery.repository', () => ({
  listVisibleProperties: vi.fn(),
  listActiveRates: vi.fn(),
  listAmenityLinks: vi.fn(),
  listRatings: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  listPropertyTypes: vi.fn().mockResolvedValue([]),
}))

const repo = await import('@/repositories/discovery.repository')
const { searchProperties, getPropertyPins } =
  await import('@/services/discovery.service')

const q = (over: Record<string, unknown> = {}) =>
  discoveryQuerySchema.parse(over)

function property(id: number, name: string, createdAt: string) {
  return {
    property_id: id,
    property_name: name,
    address: `${name} St`,
    property_type_id: null,
    property_image: null,
    created_at: createdAt,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.listVisibleProperties).mockResolvedValue([
    property(1, 'Alpha', '2026-03-01'),
    property(2, 'Bravo', '2026-02-01'),
    property(3, 'Charlie', '2026-01-01'),
  ])
  vi.mocked(repo.listActiveRates).mockResolvedValue([
    { property_id: 1, room_id: 10, period: 'monthly', price: 5000 },
    { property_id: 2, room_id: 20, period: 'monthly', price: 12000 },
  ] as never)
  vi.mocked(repo.listAmenityLinks).mockResolvedValue([
    { property_id: 1, amenity_id: 1 },
    { property_id: 1, amenity_id: 2 },
    { property_id: 2, amenity_id: 1 },
  ] as never)
  vi.mocked(repo.listRatings).mockResolvedValue([])
})

describe('searchProperties', () => {
  it('returns all visible properties by default, newest first', async () => {
    const r = await searchProperties(q())
    expect(r.items.map((i) => i.propertyId)).toEqual([1, 2, 3])
    expect(r.total).toBe(3)
    expect(r.pageCount).toBe(1)
  })

  it('shows boosted properties first in the default order, marked as boosted', async () => {
    const boosts = await import('@/services/boosts.service')
    vi.mocked(boosts.liveBoostedIds).mockResolvedValueOnce(new Set([3]))
    const r = await searchProperties(q())
    expect(r.items.map((i) => i.propertyId)).toEqual([3, 1, 2])
    expect(r.items.map((i) => i.boosted)).toEqual([true, false, false])
  })

  it('a price sort is still a price sort, boost or not', async () => {
    const boosts = await import('@/services/boosts.service')
    vi.mocked(boosts.liveBoostedIds).mockResolvedValueOnce(new Set([3]))
    const r = await searchProperties(q({ sort: 'name' }))
    expect(r.items.map((i) => i.propertyId)).toEqual(
      [...r.items]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => i.propertyId),
    )
  })

  it('filters by has-all amenities', async () => {
    const r = await searchProperties(q({ amenities: ['1', '2'] }))
    expect(r.items.map((i) => i.propertyId)).toEqual([1])
  })

  it('applies a minimum price and drops properties without a rate', async () => {
    const r = await searchProperties(q({ min: '6000' }))
    expect(r.items.map((i) => i.propertyId)).toEqual([2])
  })

  it('applies a maximum price', async () => {
    const r = await searchProperties(q({ max: '6000' }))
    expect(r.items.map((i) => i.propertyId)).toEqual([1])
  })

  it('sorts by price ascending with no-rate last', async () => {
    const r = await searchProperties(q({ sort: 'price_asc' }))
    expect(r.items.map((i) => i.propertyId)).toEqual([1, 2, 3])
  })

  it('sorts by price descending', async () => {
    const r = await searchProperties(q({ sort: 'price_desc' }))
    expect(r.items.map((i) => i.propertyId)).toEqual([2, 1, 3])
  })

  it('exposes the "from" price on cards', async () => {
    const r = await searchProperties(q())
    expect(r.items.find((i) => i.propertyId === 1)?.fromPrice).toBe(5000)
    expect(r.items.find((i) => i.propertyId === 3)?.fromPrice).toBeNull()
  })
})

describe('getPropertyPins', () => {
  it('lists only listings with a saved location, with their from-price, in two queries', async () => {
    vi.mocked(repo.listVisibleProperties).mockResolvedValue([
      {
        ...(property(1, 'Alpha', '2026-03-01') as object),
        latitude: 9.64,
        longitude: 123.85,
      },
      {
        ...(property(2, 'Bravo', '2026-02-01') as object),
        latitude: null,
        longitude: null,
      },
      {
        ...(property(3, 'Charlie', '2026-01-01') as object),
        latitude: 9.7,
        longitude: 123.9,
      },
    ] as never)
    const pins = await getPropertyPins()
    expect(pins).toEqual([
      {
        propertyId: 1,
        name: 'Alpha',
        lat: 9.64,
        lng: 123.85,
        fromPrice: 5000,
        fromPeriod: 'monthly',
      },
      {
        propertyId: 3,
        name: 'Charlie',
        lat: 9.7,
        lng: 123.9,
        fromPrice: null,
        fromPeriod: null,
      },
    ])
    expect(repo.listVisibleProperties).toHaveBeenCalledTimes(1)
    expect(repo.listActiveRates).toHaveBeenCalledTimes(1)
    expect(repo.listActiveRates).toHaveBeenCalledWith([1, 3])
  })
})
