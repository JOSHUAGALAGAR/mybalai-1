import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/repositories/matching.repository', () => ({
  getPreferences: vi.fn(),
  upsertPreferences: vi.fn(),
  deletePreferences: vi.fn(),
  lastLoggedAt: vi.fn(),
  insertLogs: vi.fn(),
}))
vi.mock('@/repositories/discovery.repository', () => ({
  listVisibleProperties: vi.fn(),
  listActiveRates: vi.fn(),
  listAmenityLinks: vi.fn(),
  listRatings: vi.fn(),
  listRoomsForProperties: vi.fn(),
  listBedsForRooms: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listPropertyTypes: vi
    .fn()
    .mockResolvedValue([{ property_type_id: 1, type_name: 'Boarding house' }]),
  listAmenities: vi.fn().mockResolvedValue([
    { amenity_id: 10, amenity_name: 'WiFi' },
    { amenity_id: 11, amenity_name: 'Laundry' },
  ]),
  listBedStatuses: vi.fn().mockResolvedValue([
    { bed_status_id: 1, status_code: 'available' },
    { bed_status_id: 2, status_code: 'occupied' },
  ]),
  listRoomStatuses: vi.fn().mockResolvedValue([
    { room_status_id: 1, status_code: 'available' },
    { room_status_id: 4, status_code: 'maintenance' },
  ]),
}))

const dal = await import('@/lib/auth/dal')
const matchingRepo = await import('@/repositories/matching.repository')
const discovery = await import('@/repositories/discovery.repository')
const service = await import('@/services/matching.service')

const tenant = { legacyUserId: 7, roles: ['tenant'] }
const prefsRow = (over: Record<string, unknown> = {}) => ({
  legacy_user_id: 7,
  budget_min: null,
  budget_max: 3000,
  area_label: 'BISU',
  area_lat: 9.6398,
  area_lng: 123.8555,
  max_distance_km: 3,
  amenity_ids: [10, 11],
  room_type_ids: [],
  move_in: 'flexible',
  occupation: 'student',
  schedule: null,
  noise: null,
  share_lifestyle: false,
  ...over,
})
const property = (id: number, over: Record<string, unknown> = {}) => ({
  property_id: id,
  property_name: `House ${id}`,
  address: 'Tagbilaran',
  property_type_id: 1,
  property_image: null,
  latitude: 9.6408,
  longitude: 123.8555,
  ...over,
})

/**  P1: affordable, near, 2 free beds, WiFi+Laundry, reviewed
 *   P2: pricier (over budget a little), no amenities
 *   P3: no free bed (all occupied) -> dropped
 *   P4: only room is under maintenance -> dropped */
function seed() {
  vi.mocked(discovery.listVisibleProperties).mockResolvedValue([
    property(1),
    property(2),
    property(3),
    property(4),
  ] as never)
  vi.mocked(discovery.listRoomsForProperties).mockResolvedValue([
    {
      room_id: 101,
      property_id: 1,
      room_type_id: 4,
      max_occupants: 4,
      status_id: 1,
    },
    {
      room_id: 201,
      property_id: 2,
      room_type_id: 1,
      max_occupants: 1,
      status_id: 1,
    },
    {
      room_id: 301,
      property_id: 3,
      room_type_id: 2,
      max_occupants: 2,
      status_id: 1,
    },
    {
      room_id: 401,
      property_id: 4,
      room_type_id: 2,
      max_occupants: 2,
      status_id: 4,
    },
  ] as never)
  vi.mocked(discovery.listBedsForRooms).mockResolvedValue([
    { bed_id: 1, room_id: 101, status_id: 1 },
    { bed_id: 2, room_id: 101, status_id: 1 },
    { bed_id: 3, room_id: 101, status_id: 2 },
    { bed_id: 4, room_id: 201, status_id: 1 },
    { bed_id: 5, room_id: 301, status_id: 2 },
    { bed_id: 6, room_id: 401, status_id: 1 },
  ] as never)
  vi.mocked(discovery.listActiveRates).mockResolvedValue([
    { property_id: 1, room_id: 101, period: 'monthly', price: 2000 },
    { property_id: 2, room_id: 201, period: 'monthly', price: 3300 },
    { property_id: 3, room_id: 301, period: 'monthly', price: 1500 },
    { property_id: 4, room_id: 401, period: 'monthly', price: 1500 },
  ] as never)
  vi.mocked(discovery.listAmenityLinks).mockResolvedValue([
    { property_id: 1, amenity_id: 10 },
    { property_id: 1, amenity_id: 11 },
  ])
  vi.mocked(discovery.listRatings).mockResolvedValue([
    { property_id: 1, rating: 5 },
    { property_id: 1, rating: 4 },
    { property_id: 1, rating: 5 },
    { property_id: 1, rating: 4 },
  ] as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(dal.requireUser).mockResolvedValue(tenant as never)
  vi.mocked(matchingRepo.getPreferences).mockResolvedValue(prefsRow() as never)
  vi.mocked(matchingRepo.lastLoggedAt).mockResolvedValue(null)
  seed()
})

describe('getMyMatches', () => {
  it('asks for preferences first when the tenant has not given any', async () => {
    vi.mocked(matchingRepo.getPreferences).mockResolvedValue(null)
    await expect(service.getMyMatches()).resolves.toEqual({
      needsPreferences: true,
    })
    expect(discovery.listVisibleProperties).not.toHaveBeenCalled()
  })

  it('ranks the listings the tenant can actually take, best first, with reasons', async () => {
    const r = await service.getMyMatches()
    if (r.needsPreferences) throw new Error('expected matches')
    expect(r.items.map((i) => i.propertyId)).toEqual([1, 2])
    expect(r.considered).toBe(4)
    expect(r.excluded).toBe(2) // no free bed, room under maintenance
    const best = r.items[0]
    expect(best.fit.score).toBeGreaterThan(r.items[1].fit.score)
    expect(best.fit.reasons.join(' | ')).toMatch(
      /Within your budget — from ₱2,000/,
    )
    expect(best.fit.reasons.join(' | ')).toMatch(
      /2 of your 2 amenities: WiFi, Laundry/,
    )
    expect(best.typeName).toBe('Boarding house')
    expect(best.fromPrice).toBe(2000)
    expect(r.items[1].fit.concerns.join(' ')).toMatch(/over your budget/)
  })

  it('a tenant who chose Single sees only listings with a free Single room', async () => {
    vi.mocked(matchingRepo.getPreferences).mockResolvedValue(
      prefsRow({ room_type_ids: [1], budget_max: 4000 }) as never,
    )
    const r = await service.getMyMatches()
    if (r.needsPreferences) throw new Error('expected matches')
    expect(r.items.map((i) => i.propertyId)).toEqual([2]) // P1's only room is a Quad
  })

  it('uses a fixed number of queries however many listings there are', async () => {
    await service.getMyMatches()
    for (const fn of [
      discovery.listActiveRates,
      discovery.listAmenityLinks,
      discovery.listRatings,
      discovery.listRoomsForProperties,
      discovery.listBedsForRooms,
    ]) {
      expect(fn).toHaveBeenCalledTimes(1)
    }
  })

  it('records what was shown for evaluation, but not on every refresh', async () => {
    await service.getMyMatches()
    expect(matchingRepo.insertLogs).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 7, property_id: 1, rank: 1 }),
      expect.objectContaining({ user_id: 7, property_id: 2, rank: 2 }),
    ])
    vi.mocked(matchingRepo.insertLogs).mockClear()
    vi.mocked(matchingRepo.lastLoggedAt).mockResolvedValue(
      new Date(Date.now() - 60_000).toISOString(),
    )
    await service.getMyMatches()
    expect(matchingRepo.insertLogs).not.toHaveBeenCalled()
  })

  it('a logging failure never hides the recommendations', async () => {
    vi.mocked(matchingRepo.insertLogs).mockRejectedValue(new Error('no table'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await service.getMyMatches()
    expect(r.needsPreferences).toBe(false)
    spy.mockRestore()
  })

  it('is for tenants only', async () => {
    vi.mocked(dal.requireUser).mockResolvedValue({
      legacyUserId: 9,
      roles: ['landlord'],
    } as never)
    await expect(service.getMyMatches()).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('saveMyPreferences', () => {
  beforeEach(() =>
    vi
      .mocked(matchingRepo.upsertPreferences)
      .mockResolvedValue(prefsRow() as never),
  )

  it('saves what was answered, leaving the rest empty', async () => {
    await service.saveMyPreferences({
      budget_max: '3000',
      room_type_ids: [4, 4, 6],
      amenity_ids: [10, 10, 11],
    })
    expect(matchingRepo.upsertPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        legacy_user_id: 7,
        budget_max: 3000,
        budget_min: null,
        room_type_ids: [4, 6],
        amenity_ids: [10, 11],
        share_lifestyle: false,
        area_lat: null,
      }),
    )
  })

  it('rejects impossible answers', async () => {
    await expect(
      service.saveMyPreferences({ budget_min: 5000, budget_max: 3000 }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      service.saveMyPreferences({ area_lat: 9.6, area_lng: null }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      service.saveMyPreferences({ max_distance_km: 500 }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      service.saveMyPreferences({ room_type_ids: ['penthouse'] }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(matchingRepo.upsertPreferences).not.toHaveBeenCalled()
  })

  it('keeps the lifestyle answers private unless the tenant opts in', async () => {
    await service.saveMyPreferences({ occupation: 'student', noise: 'quiet' })
    expect(matchingRepo.upsertPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ share_lifestyle: false }),
    )
  })
})
