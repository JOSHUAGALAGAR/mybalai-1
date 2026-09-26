import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/repositories/beds.repository', () => ({
  insertBeds: vi.fn(),
  listBedsByRoom: vi.fn(),
}))
vi.mock('@/repositories/rental-rates.repository', () => ({
  insertRates: vi.fn(),
}))
vi.mock('@/repositories/rooms.repository', () => ({
  insertRooms: vi.fn(),
  softDeleteRooms: vi.fn(),
  listRoomsByProperty: vi.fn(),
  getRoom: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  resolveStatusId: vi.fn().mockResolvedValue(1),
}))
vi.mock('@/services/property-access', () => ({
  requireManageableProperty: vi.fn(),
  requireManageableRoom: vi.fn(),
  requireOperableRoom: vi.fn(),
}))

const beds = await import('@/repositories/beds.repository')
const ratesRepo = await import('@/repositories/rental-rates.repository')
const roomsRepo = await import('@/repositories/rooms.repository')
const access = await import('@/services/property-access')
const { createRoomsBatch } = await import('@/services/rooms.service')
const { createRatesBatch } = await import('@/services/rental-rates.service')

const landlord = { roles: ['landlord'], legacyUserId: 5 }
const property = { property_id: 9, property_owner: 5 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(access.requireManageableProperty).mockResolvedValue({
    user: landlord,
    property,
  } as never)
  vi.mocked(roomsRepo.listRoomsByProperty).mockResolvedValue([
    { room_id: 1 },
  ] as never)
  vi.mocked(roomsRepo.insertRooms).mockImplementation((async (
    rows: unknown[],
  ) => rows.map((_, i) => ({ room_id: 100 + i }))) as never)
  vi.mocked(beds.insertBeds).mockResolvedValue([])
  vi.mocked(ratesRepo.insertRates).mockResolvedValue([])
  vi.mocked(roomsRepo.softDeleteRooms).mockResolvedValue(undefined)
})

const room = (over: Record<string, unknown> = {}) => ({
  room_number: '101',
  max_occupants: '2',
  beds: '2',
  rates: [{ period: 'monthly', price: '3500', valid_from: '2026-10-01' }],
  ...over,
})

describe('createRoomsBatch', () => {
  it('saves rooms, beds and rates in three bulk requests', async () => {
    const result = await createRoomsBatch(9, {
      version: 1,
      rooms: [room(), room({ room_number: '102', beds: 1, rates: [] })],
    })
    expect(result).toEqual({ rooms: 2, beds: 3, rates: 1, roomIds: [100, 101] })
    expect(roomsRepo.insertRooms).toHaveBeenCalledTimes(1)
    expect(beds.insertBeds).toHaveBeenCalledTimes(1)
    expect(ratesRepo.insertRates).toHaveBeenCalledTimes(1)
    const bedRows = vi.mocked(beds.insertBeds).mock.calls[0][0]
    expect(bedRows.map((b) => [b.room_id, b.bed_number])).toEqual([
      [100, '1'],
      [100, '2'],
      [101, '1'],
    ])
    expect(vi.mocked(ratesRepo.insertRates).mock.calls[0][0][0]).toMatchObject({
      property_id: 9,
      room_id: 100,
      price: 3500,
      valid_until: null,
    })
  })

  it('only writes the advance / deposit switches that are on', async () => {
    await createRoomsBatch(9, {
      rooms: [room({ require_advance: true, require_deposit: false })],
    })
    const row = vi.mocked(roomsRepo.insertRooms).mock.calls[0][0][0] as Record<
      string,
      unknown
    >
    expect(row.require_advance).toBe(true)
    expect(row).not.toHaveProperty('require_deposit')
  })

  it('names the room and the problem when the draft is invalid', async () => {
    await expect(
      createRoomsBatch(9, { rooms: [room(), room({ max_occupants: '0' })] }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringMatching(/^Room 2: .*at least 1/),
    })
    expect(roomsRepo.insertRooms).not.toHaveBeenCalled()
  })

  it('refuses an empty draft and more than 30 rooms', async () => {
    await expect(createRoomsBatch(9, { rooms: [] })).rejects.toMatchObject({
      code: 'validation',
    })
    await expect(
      createRoomsBatch(9, { rooms: Array.from({ length: 31 }, () => room()) }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('takes the new rooms back off if beds or rates fail (nothing half-saved)', async () => {
    vi.mocked(ratesRepo.insertRates).mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      createRoomsBatch(9, { rooms: [room(), room()] }),
    ).rejects.toThrow('boom')
    expect(roomsRepo.softDeleteRooms).toHaveBeenCalledWith([100, 101])
    spy.mockRestore()
  })

  it('a rate whose end is before its start is rejected', async () => {
    await expect(
      createRoomsBatch(9, {
        rooms: [
          room({
            rates: [
              {
                period: 'monthly',
                price: 1,
                valid_from: '2026-10-05',
                valid_until: '2026-10-01',
              },
            ],
          }),
        ],
      }),
    ).rejects.toMatchObject({ message: /end date/ })
  })
})

describe('createRatesBatch', () => {
  const rate = (over: Record<string, unknown> = {}) => ({
    room_id: 1,
    period: 'weekly',
    price: '900',
    valid_from: '2026-10-01',
    ...over,
  })

  it('saves many rates in one request', async () => {
    vi.mocked(ratesRepo.insertRates).mockResolvedValue([{}, {}] as never)
    const result = await createRatesBatch(9, {
      rates: [rate(), rate({ period: 'daily', price: 150 })],
    })
    expect(result).toEqual({ rates: 2 })
    expect(ratesRepo.insertRates).toHaveBeenCalledTimes(1)
  })

  it('refuses rooms that belong to another property', async () => {
    await expect(
      createRatesBatch(9, { rates: [rate(), rate({ room_id: 77 })] }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: /Rate 2: that room does not belong/,
    })
    expect(ratesRepo.insertRates).not.toHaveBeenCalled()
  })
})
