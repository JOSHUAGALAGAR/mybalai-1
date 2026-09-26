import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/repositories/bookings.repository', () => ({
  callExpireOverdueBookings: vi.fn().mockResolvedValue(0),
  listBookingsForManager: vi.fn().mockResolvedValue([]),
  propertyNamesByIds: vi.fn(),
  roomLabelsByIds: vi.fn(),
  bedNumbersByIds: vi.fn(),
  tenantNamesByIds: vi.fn(),
  MANAGER_LIST_LIMIT: 300,
}))
vi.mock('@/repositories/payments.repository', () => ({
  listPaymentsForManager: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/caretakers.repository', () => ({
  listAssignedPropertyIds: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listBookingStatuses: vi
    .fn()
    .mockResolvedValue([{ booking_status_id: 2, status_code: 'confirmed' }]),
  listPaymentStatuses: vi
    .fn()
    .mockResolvedValue([{ payment_status_id: 1, status_code: 'pending' }]),
}))
vi.mock('@/repositories/beds.repository', () => ({}))
vi.mock('@/repositories/discovery.repository', () => ({}))
vi.mock('@/repositories/properties.repository', () => ({}))
vi.mock('@/repositories/rooms.repository', () => ({}))
vi.mock('@/repositories/verification.repository', () => ({}))
vi.mock('@/services/audit.service', () => ({ recordAudit: vi.fn() }))
vi.mock('@/services/property-access', () => ({}))

const dal = await import('@/lib/auth/dal')
const bookingsRepo = await import('@/repositories/bookings.repository')
const paymentsRepo = await import('@/repositories/payments.repository')
const caretakers = await import('@/repositories/caretakers.repository')
const { listManagedBookings } = await import('@/services/bookings.service')
const { listManagedPayments } = await import('@/services/payments.service')

const as = (roles: string[], id = 5) =>
  vi
    .mocked(dal.requireUser)
    .mockResolvedValue({ legacyUserId: id, roles } as never)

beforeEach(() => vi.clearAllMocks())

describe.each([
  [
    'bookings',
    () => listManagedBookings,
    () => vi.mocked(bookingsRepo.listBookingsForManager),
  ],
  [
    'payments',
    () => listManagedPayments,
    () => vi.mocked(paymentsRepo.listPaymentsForManager),
  ],
] as const)('manager %s list', (_name, list, repoFn) => {
  it('a landlord is filtered by owner IN THE DATABASE (no list of property ids is fetched or sent)', async () => {
    as(['landlord'])
    await list()('landlord')
    expect(repoFn()).toHaveBeenCalledWith(
      { kind: 'owner', ownerId: 5 },
      { statusId: undefined },
    )
  })
  it('a caretaker sees only the properties assigned to them', async () => {
    as(['caretaker'])
    vi.mocked(caretakers.listAssignedPropertyIds).mockResolvedValue([11, 12])
    await list()('caretaker')
    expect(repoFn()).toHaveBeenCalledWith(
      { kind: 'properties', propertyIds: [11, 12] },
      { statusId: undefined },
    )
  })
  it('the superadmin sees everything, with no filter', async () => {
    as(['superadmin'])
    await list()('landlord')
    expect(repoFn()).toHaveBeenCalledWith(
      { kind: 'all' },
      { statusId: undefined },
    )
  })
  it('passes the status filter through', async () => {
    as(['landlord'])
    await list()('landlord', _name === 'bookings' ? 'confirmed' : 'pending')
    expect(repoFn().mock.calls[0][1]).toEqual({
      statusId: _name === 'bookings' ? 2 : 1,
    })
  })
})
