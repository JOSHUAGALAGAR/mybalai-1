import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'
import type { AppRole } from '@/lib/auth/roles'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/services/property-access', () => ({
  requireManageableProperty: vi.fn().mockResolvedValue({}),
  requireOperableProperty: vi.fn().mockResolvedValue({ property: {} }),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  getBooking: vi.fn(),
  listBookingsByUser: vi.fn(),
  listBookingsByProperties: vi.fn(),
  propertyNamesByIds: vi.fn().mockResolvedValue(new Map()),
  tenantNamesByIds: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('@/repositories/caretakers.repository', () => ({
  listAssignedPropertyIds: vi.fn(),
}))
vi.mock('@/repositories/properties.repository', () => ({
  listProperties: vi.fn(),
  getProperty: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listPaymentMethods: vi.fn().mockResolvedValue([]),
  listPaymentStatuses: vi.fn().mockResolvedValue([]),
  listBookingStatuses: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/payments.repository', () => ({
  getPayment: vi.fn(),
  bookingRefsByIds: vi.fn(),
  resolveMethodId: vi.fn(),
  callCreatePayment: vi.fn(),
  callSetPaymentStatus: vi.fn(),
}))

const { requireUser } = await import('@/lib/auth/dal')
const bookingsRepo = await import('@/repositories/bookings.repository')
const paymentsRepo = await import('@/repositories/payments.repository')
const propsRepo = await import('@/repositories/properties.repository')
const access = await import('@/services/property-access')
const service = await import('@/services/payments.service')

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

const input = { booking_id: '12', amount: '8000', method_code: 'gcash' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(bookingsRepo.getBooking).mockResolvedValue({
    booking_id: 12,
    user_id: 900,
    property_id: 1,
  } as never)
  vi.mocked(paymentsRepo.resolveMethodId).mockResolvedValue(3)
  vi.mocked(paymentsRepo.callCreatePayment).mockResolvedValue(1000500)
})

describe('createPayment', () => {
  it('rejects a landlord', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    await expect(service.createPayment(input)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('rejects a booking that is not the tenant’s', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    vi.mocked(bookingsRepo.getBooking).mockResolvedValue({
      booking_id: 12,
      user_id: 555,
      property_id: 1,
    } as never)
    await expect(service.createPayment(input)).rejects.toMatchObject({
      code: 'validation',
    })
  })

  it('creates a pending payment via the RPC', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    const id = await service.createPayment(input)
    expect(id).toBe(1000500)
    expect(paymentsRepo.callCreatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        p_user: 900,
        p_created_by: 900,
        p_created_by_role: 'tenant',
        p_booking: 12,
        p_amount: 8000,
        p_method: 3,
      }),
    )
  })
})

describe('decidePayment', () => {
  beforeEach(() => {
    vi.mocked(paymentsRepo.getPayment).mockResolvedValue({
      payment_id: 50,
      booking_id: 12,
    } as never)
    vi.mocked(paymentsRepo.bookingRefsByIds).mockResolvedValue(
      new Map([[12, { property_id: 1, room_id: 2, user_id: 900 }]]),
    )
  })

  it('requires owner/superadmin (requireManageableProperty) then calls the RPC', async () => {
    asUser.mockResolvedValue(user(['landlord'], 42))
    await service.decidePayment(50, { to: 'paid', note: 'ok' })
    expect(access.requireManageableProperty).toHaveBeenCalledWith(1)
    expect(paymentsRepo.callSetPaymentStatus).toHaveBeenCalledWith({
      p_payment: 50,
      p_actor: 42,
      p_actor_role: 'landlord',
      p_to_code: 'paid',
      p_note: 'ok',
    })
  })

  it('rejects an invalid decision value', async () => {
    asUser.mockResolvedValue(user(['landlord'], 42))
    await expect(
      service.decidePayment(50, { to: 'cancelled' }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('404s a payment with no booking', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    vi.mocked(paymentsRepo.getPayment).mockResolvedValue({
      payment_id: 50,
      booking_id: null,
    } as never)
    await expect(
      service.decidePayment(50, { to: 'paid' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

// keep unused import referenced
void propsRepo
