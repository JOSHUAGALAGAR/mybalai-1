import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'
import type { AppRole } from '@/lib/auth/roles'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/services/property-access', () => ({
  requireOperableProperty: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listBookingStatuses: vi.fn(),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  getBooking: vi.fn(),
  getRateSnapshot: vi.fn(),
  tenantNamesByIds: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('@/repositories/extensions.repository', () => ({
  getExtension: vi.fn(),
  listExtensionsByBooking: vi.fn().mockResolvedValue([]),
  callCreateExtension: vi.fn().mockResolvedValue(1000777),
  callSetExtensionStatus: vi.fn().mockResolvedValue('approved'),
}))

const { requireUser } = await import('@/lib/auth/dal')
const access = await import('@/services/property-access')
const refRepo = await import('@/repositories/reference.repository')
const bookingsRepo = await import('@/repositories/bookings.repository')
const extRepo = await import('@/repositories/extensions.repository')
const service = await import('@/services/extensions.service')

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(refRepo.listBookingStatuses).mockResolvedValue([
    { booking_status_id: 2, status_code: 'confirmed' },
    { booking_status_id: 1, status_code: 'pending' },
  ] as never)
  vi.mocked(bookingsRepo.getBooking).mockResolvedValue({
    booking_id: 5,
    user_id: 900,
    property_id: 1,
    booking_status_id: 2,
    check_out_date: '2026-05-01',
  } as never)
  vi.mocked(bookingsRepo.getRateSnapshot).mockResolvedValue({
    period: 'monthly',
    price: 8000,
  } as never)
})

describe('requestExtension', () => {
  it('rejects a landlord', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    await expect(
      service.requestExtension(5, { new_check_out: '2026-05-31' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it("404s another tenant's booking", async () => {
    asUser.mockResolvedValue(user(['tenant'], 111))
    await expect(
      service.requestExtension(5, { new_check_out: '2026-05-31' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('computes the amount from the rate snapshot (one month)', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    const id = await service.requestExtension(5, {
      new_check_out: '2026-05-31',
    })
    expect(id).toBe(1000777)
    expect(extRepo.callCreateExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        p_booking: 5,
        p_requested_by: 900,
        p_new_check_out: '2026-05-31',
        p_amount: 8000,
      }),
    )
  })

  it('rejects when the booking is not active', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    vi.mocked(bookingsRepo.getBooking).mockResolvedValue({
      booking_id: 5,
      user_id: 900,
      property_id: 1,
      booking_status_id: 1,
      check_out_date: '2026-05-01',
    } as never)
    await expect(
      service.requestExtension(5, { new_check_out: '2026-05-31' }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(extRepo.callCreateExtension).not.toHaveBeenCalled()
  })

  it('rejects a date on or before the current check-out', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    await expect(
      service.requestExtension(5, { new_check_out: '2026-05-01' }),
    ).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('decideExtension', () => {
  it('404s an unknown extension', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    vi.mocked(extRepo.getExtension).mockResolvedValue(null)
    await expect(
      service.decideExtension(9, { to: 'approved' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('authorizes the property then calls the RPC', async () => {
    asUser.mockResolvedValue(user(['caretaker'], 42))
    vi.mocked(extRepo.getExtension).mockResolvedValue({
      extension_id: 9,
      booking_id: 5,
    } as never)
    await service.decideExtension(9, { to: 'rejected', response: 'No room' })
    expect(access.requireOperableProperty).toHaveBeenCalledWith(1)
    expect(extRepo.callSetExtensionStatus).toHaveBeenCalledWith({
      p_extension: 9,
      p_actor: 42,
      p_actor_role: 'caretaker',
      p_to_code: 'rejected',
      p_response: 'No room',
    })
  })
})
