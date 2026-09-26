import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/services/boosts.service', () => ({
  liveBoostedIds: vi.fn().mockResolvedValue(new Set<number>()),
}))
vi.mock('@/repositories/discovery.repository', () => ({
  listVisibleProperties: vi.fn(),
  listActiveRates: vi.fn(),
  listRatings: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  listPropertyTypes: vi
    .fn()
    .mockResolvedValue([{ property_type_id: 1, type_name: 'Boarding house' }]),
}))

const repo = await import('@/repositories/discovery.repository')
const boosts = await import('@/services/boosts.service')
const { buildFeaturedProperties, getFeaturedProperties } =
  await import('@/services/featured.service')

const property = (id: number, over: Record<string, unknown> = {}) => ({
  property_id: id,
  property_name: `House ${id}`,
  address: 'Tagbilaran',
  property_type_id: 1,
  property_image: `https://img/${id}.jpg`,
  created_at: `2026-0${id}-01`,
  property_owner: 999,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(boosts.liveBoostedIds).mockResolvedValue(new Set())
  vi.mocked(repo.listVisibleProperties).mockResolvedValue([
    property(1),
    property(2),
    property(3),
    property(4, { property_image: null }), // no photo and no rate: not worth showing
  ] as never)
  vi.mocked(repo.listActiveRates).mockResolvedValue([
    { property_id: 1, period: 'monthly', price: 3000 },
    { property_id: 1, period: 'monthly', price: 2500 },
    { property_id: 2, period: 'weekly', price: 900 },
  ] as never)
  vi.mocked(repo.listRatings).mockResolvedValue([
    { property_id: 2, rating: 5 },
    { property_id: 3, rating: 5 },
    { property_id: 3, rating: 5 },
    { property_id: 3, rating: 4 },
  ] as never)
})

describe('buildFeaturedProperties', () => {
  it('ranks boosted first, then the better-reviewed, and shows only public fields', async () => {
    vi.mocked(boosts.liveBoostedIds).mockResolvedValue(new Set([1]))
    const list = await buildFeaturedProperties()
    expect(list.map((p) => p.propertyId)).toEqual([1, 3, 2]) // 1 boosted; 3 has more reviews than 2
    expect(list[0]).toMatchObject({
      name: 'House 1',
      typeName: 'Boarding house',
      fromPrice: 2500,
      fromPeriod: 'monthly',
      boosted: true,
    })
    expect(JSON.stringify(list)).not.toContain('999') // the owner never leaks
    expect(list.find((p) => p.propertyId === 4)).toBeUndefined()
  })

  it('caps the list and uses a fixed number of queries', async () => {
    const list = await buildFeaturedProperties(2)
    expect(list).toHaveLength(2)
    expect(repo.listVisibleProperties).toHaveBeenCalledTimes(1)
    expect(repo.listActiveRates).toHaveBeenCalledTimes(1)
    expect(repo.listRatings).toHaveBeenCalledTimes(1)
  })

  it('is empty when there are no listings', async () => {
    vi.mocked(repo.listVisibleProperties).mockResolvedValue([])
    expect(await buildFeaturedProperties()).toEqual([])
  })
})

describe('getFeaturedProperties', () => {
  it('never throws: a database problem just means no cards', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(repo.listVisibleProperties).mockRejectedValue(new Error('down'))
    expect(await getFeaturedProperties()).toEqual([])
  })
})
