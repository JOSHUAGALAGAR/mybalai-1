import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'
import type { AppRole } from '@/lib/auth/roles'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/services/property-access', () => ({
  requireOperableProperty: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/discovery.repository', () => ({
  getVisibleProperty: vi.fn(),
  listActiveRates: vi.fn(),
}))
vi.mock('@/repositories/rooms.repository', () => ({
  getRoom: vi.fn(),
  listRoomsByProperty: vi.fn(),
}))
vi.mock('@/repositories/beds.repository', () => ({
  getBed: vi.fn(),
  listBedsByProperty: vi.fn(),
}))
vi.mock('@/repositories/caretakers.repository', () => ({
  listAssignedPropertyIds: vi.fn(),
}))
vi.mock('@/repositories/properties.repository', () => ({
  listProperties: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listBookingStatuses: vi.fn(),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  getBooking: vi.fn(),
  listBlockingBookingsForBed: vi.fn(),
  callCreateBooking: vi.fn(),
  callSetBookingStatus: vi.fn(),
  callExpireOverdueBookings: vi.fn().mockResolvedValue(0),
}))

const { requireUser } = await import('@/lib/auth/dal')
const discoveryRepo = await import('@/repositories/discovery.repository')
const roomsRepo = await import('@/repositories/rooms.repository')
const bedsRepo = await import('@/repositories/beds.repository')
const refRepo = await import('@/repositories/reference.repository')
const bookingsRepo = await import('@/repositories/bookings.repository')
const service = await import('@/services/bookings.service')

const asUser = vi.mocked(requireUser)

function user(roles: AppRole[], legacyUserId = 900): CurrentUser {
  return {
    authUserId: 'u',
    legacyUserId,
    email: 'x@example.com',
    fullName: 'X',
    phone: null,
    address: null,
    avatarUrl: null,
    isActive: true,
    roles,
  }
}

const input = {
  room_id: '10',
  bed_id: '3',
  period: 'monthly',
  check_in: '2026-04-01',
  check_out: '2026-05-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(discoveryRepo.getVisibleProperty).mockResolvedValue({
    property_id: 1,
    property_name: 'P',
  } as never)
  vi.mocked(roomsRepo.getRoom).mockResolvedValue({
    room_id: 10,
    property_id: 1,
  } as never)
  vi.mocked(bedsRepo.getBed).mockResolvedValue({
    bed_id: 3,
    room_id: 10,
  } as never)
  vi.mocked(discoveryRepo.listActiveRates).mockResolvedValue([
    {
      rate_id: 7,
      room_id: 10,
      period: 'monthly',
      price: 8000,
      valid_from: '2026-01-01',
      valid_until: null,
    },
  ] as never)
  vi.mocked(refRepo.listBookingStatuses).mockResolvedValue([
    {
      booking_status_id: 1,
      status_code: 'pending',
      is_inventory_blocking: false,
    },
    {
      booking_status_id: 2,
      status_code: 'confirmed',
      is_inventory_blocking: true,
    },
    {
      booking_status_id: 3,
      status_code: 'checked_in',
      is_inventory_blocking: true,
    },
  ] as never)
  vi.mocked(bookingsRepo.listBlockingBookingsForBed).mockResolvedValue([])
  vi.mocked(bookingsRepo.callCreateBooking).mockResolvedValue(1000123)
})

describe('createBooking', () => {
  it('rejects a landlord', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    await expect(service.createBooking(1, input)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('creates a pending booking with a computed monthly total', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    const id = await service.createBooking(1, input)
    expect(id).toBe(1000123)
    expect(bookingsRepo.callCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        p_user: 900,
        p_property: 1,
        p_room: 10,
        p_bed: 3,
        p_rate: 7,
        p_period: 'monthly',
        p_price: 8000,
        p_total: 8000, // 30 nights -> 1 month
      }),
    )
  })

  it('a room without advance/deposit sends neither argument (works before migration 0014)', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    await service.createBooking(1, input)
    const args = vi.mocked(bookingsRepo.callCreateBooking).mock.calls[0][0]
    expect('p_advance' in args).toBe(false)
    expect('p_deposit' in args).toBe(false)
  })

  it('adds 1 month advance and 1 month deposit to the total when the room requires them', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    vi.mocked(roomsRepo.getRoom).mockResolvedValue({
      room_id: 10,
      property_id: 1,
      require_advance: true,
      require_deposit: true,
    } as never)
    await service.createBooking(1, input)
    expect(bookingsRepo.callCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        p_total: 24000, // 8000 rent + 8000 advance + 8000 deposit
        p_advance: 8000,
        p_deposit: 8000,
      }),
    )
  })

  it('advance only', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    vi.mocked(roomsRepo.getRoom).mockResolvedValue({
      room_id: 10,
      property_id: 1,
      require_advance: true,
      require_deposit: false,
    } as never)
    await service.createBooking(1, input)
    const args = vi.mocked(bookingsRepo.callCreateBooking).mock.calls[0][0]
    expect(args.p_total).toBe(16000)
    expect(args.p_advance).toBe(8000)
    expect('p_deposit' in args).toBe(false)
  })

  it('rejects when no rate exists for the period', async () => {
    asUser.mockResolvedValue(user(['tenant']))
    vi.mocked(discoveryRepo.listActiveRates).mockResolvedValue([])
    await expect(service.createBooking(1, input)).rejects.toMatchObject({
      code: 'validation',
    })
  })

  it('rejects when the bed is already booked for overlapping dates', async () => {
    asUser.mockResolvedValue(user(['tenant']))
    vi.mocked(bookingsRepo.listBlockingBookingsForBed).mockResolvedValue([
      { check_in_date: '2026-04-15', check_out_date: '2026-06-01' },
    ])
    await expect(service.createBooking(1, input)).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(bookingsRepo.callCreateBooking).not.toHaveBeenCalled()
  })
})

describe('transitionManagedBooking', () => {
  it('404s an unknown booking', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    vi.mocked(bookingsRepo.getBooking).mockResolvedValue(null)
    await expect(
      service.transitionManagedBooking(5, { to: 'confirmed' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('calls the RPC with the parsed transition + actor', async () => {
    asUser.mockResolvedValue(user(['landlord'], 42))
    vi.mocked(bookingsRepo.getBooking).mockResolvedValue({
      booking_id: 5,
      property_id: 1,
      booking_status_id: 1,
    } as never)
    await service.transitionManagedBooking(5, {
      to: 'payment_pending',
      response: 'See you soon',
    })
    expect(bookingsRepo.callSetBookingStatus).toHaveBeenCalledWith({
      p_booking: 5,
      p_actor: 42,
      p_actor_role: 'landlord',
      p_to_code: 'payment_pending',
      p_response: 'See you soon',
    })
  })
})
