import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/property-access', () => ({
  requireOperableProperty: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  getBooking: vi.fn(),
  listBlockingBookingsForRoom: vi.fn(),
}))
vi.mock('@/repositories/matching.repository', () => ({
  listSharedLifestyles: vi.fn(),
}))
vi.mock('@/repositories/rooms.repository', () => ({ getRoom: vi.fn() }))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listBookingStatuses: vi.fn().mockResolvedValue([
    { booking_status_id: 1, is_inventory_blocking: false },
    { booking_status_id: 3, is_inventory_blocking: true },
  ]),
}))

const access = await import('@/services/property-access')
const bookings = await import('@/repositories/bookings.repository')
const matching = await import('@/repositories/matching.repository')
const rooms = await import('@/repositories/rooms.repository')
const { getHousemateFit } = await import('@/services/allocation.service')

const booking = {
  booking_id: 50,
  user_id: 7,
  property_id: 1,
  room_id: 9,
  check_in_date: '2026-10-01',
  check_out_date: '2026-11-01',
}
const prefs = (id: number, over: Record<string, unknown> = {}) => ({
  legacy_user_id: id,
  occupation: null,
  schedule: 'day',
  noise: 'quiet',
  share_lifestyle: true,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(bookings.getBooking).mockResolvedValue(booking as never)
  vi.mocked(rooms.getRoom).mockResolvedValue({
    room_id: 9,
    max_occupants: 4,
  } as never)
})

describe('getHousemateFit', () => {
  it('is not needed for a solo room', async () => {
    vi.mocked(rooms.getRoom).mockResolvedValue({
      room_id: 9,
      max_occupants: 1,
    } as never)
    expect(await getHousemateFit(50)).toEqual({ kind: 'solo' })
    expect(bookings.listBlockingBookingsForRoom).not.toHaveBeenCalled()
  })

  it('checks the landlord may manage the property', async () => {
    vi.mocked(access.requireOperableProperty).mockRejectedValueOnce(
      new Error('nope'),
    )
    await expect(getHousemateFit(50)).rejects.toThrow('nope')
  })

  it('compares only overlapping housemates who shared, and reports the whole room', async () => {
    vi.mocked(bookings.listBlockingBookingsForRoom).mockResolvedValue([
      {
        booking_id: 60,
        user_id: 21,
        check_in_date: '2026-09-01',
        check_out_date: '2027-01-01',
      },
      {
        booking_id: 61,
        user_id: 22,
        check_in_date: '2026-08-01',
        check_out_date: '2026-09-15',
      }, // gone before
      {
        booking_id: 62,
        user_id: 23,
        check_in_date: '2026-10-05',
        check_out_date: '2026-12-01',
      }, // did not share
    ])
    vi.mocked(matching.listSharedLifestyles).mockResolvedValue([
      prefs(7) as never,
      prefs(21) as never,
    ])
    const fit = await getHousemateFit(50)
    expect(bookings.listBlockingBookingsForRoom).toHaveBeenCalledWith(9, [3], {
      excludeBookingId: 50,
    })
    expect(matching.listSharedLifestyles).toHaveBeenCalledWith([7, 21, 23])
    expect(fit).toMatchObject({
      kind: 'shared',
      tenantShared: true,
      score: 100,
      verdict: 'good',
      compared: 1,
      housemates: 2,
    })
  })

  it('cannot judge when the tenant kept their answers private', async () => {
    vi.mocked(bookings.listBlockingBookingsForRoom).mockResolvedValue([
      {
        booking_id: 60,
        user_id: 21,
        check_in_date: '2026-09-01',
        check_out_date: '2027-01-01',
      },
    ])
    vi.mocked(matching.listSharedLifestyles).mockResolvedValue([
      prefs(21) as never,
    ])
    expect(await getHousemateFit(50)).toMatchObject({
      kind: 'shared',
      tenantShared: false,
      score: null,
      verdict: 'unknown',
    })
  })

  it('points at migration 0022 when the tables are missing', async () => {
    vi.mocked(bookings.listBlockingBookingsForRoom).mockResolvedValue([])
    vi.mocked(matching.listSharedLifestyles).mockRejectedValue(
      Object.assign(new Error('x'), {
        cause: {
          code: '42P01',
          message: 'relation "tenant_preferences" does not exist',
        },
      }),
    )
    await expect(getHousemateFit(50)).rejects.toThrow(/0022/)
  })
})
