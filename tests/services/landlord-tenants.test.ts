import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/bookings.service', () => ({ listManagedBookings: vi.fn() }))
vi.mock('@/repositories/users.repository', () => ({
  listAccountsByIds: vi.fn(),
}))

const bookings = await import('@/services/bookings.service')
const usersRepo = await import('@/repositories/users.repository')
const { listMyTenants } = await import('@/services/landlord-tenants.service')

const b = (over: Record<string, unknown>) =>
  ({
    bookingId: 1,
    propertyId: 1,
    propertyName: 'Sunrise',
    roomLabel: 'R1',
    bedNumber: '1',
    checkIn: '2026-10-01',
    checkOut: '2026-11-01',
    statusCode: 'confirmed',
    statusName: 'Confirmed',
    totalAmount: 4500,
    tenantId: 7,
    tenantName: 'Ana',
    ...over,
  }) as never
const acct = (id: number, name: string) =>
  ({
    legacy_user_id: id,
    full_name: name,
    email: `${name}@x.com`,
    phone: `09${id}`,
  }) as never

beforeEach(() => vi.clearAllMocks())

describe('listMyTenants', () => {
  it('lists only people with a confirmed / checked-in / checked-out booking — not requests or cancellations', async () => {
    vi.mocked(bookings.listManagedBookings).mockResolvedValue([
      b({ bookingId: 1, tenantId: 7, statusCode: 'confirmed' }),
      b({ bookingId: 2, tenantId: 8, statusCode: 'pending' }),
      b({ bookingId: 3, tenantId: 9, statusCode: 'payment_pending' }),
      b({ bookingId: 4, tenantId: 10, statusCode: 'cancelled' }),
      b({ bookingId: 5, tenantId: 11, statusCode: 'rejected' }),
    ])
    vi.mocked(usersRepo.listAccountsByIds).mockResolvedValue([acct(7, 'Ana')])
    const list = await listMyTenants()
    expect(list.map((t) => t.tenantId)).toEqual([7])
    expect(usersRepo.listAccountsByIds).toHaveBeenCalledWith([7]) // contact details are only fetched for real tenants
  })

  it('groups a tenant’s stays, and orders current → upcoming → past, then by name', async () => {
    vi.mocked(bookings.listManagedBookings).mockResolvedValue([
      b({
        bookingId: 1,
        tenantId: 1,
        statusCode: 'checked_out',
        tenantName: 'Zed',
      }),
      b({
        bookingId: 2,
        tenantId: 2,
        statusCode: 'confirmed',
        tenantName: 'Bea',
      }),
      b({
        bookingId: 3,
        tenantId: 3,
        statusCode: 'checked_in',
        tenantName: 'Cy',
      }),
      b({
        bookingId: 4,
        tenantId: 3,
        statusCode: 'checked_out',
        checkIn: '2026-01-01',
        tenantName: 'Cy',
      }),
      b({
        bookingId: 5,
        tenantId: 4,
        statusCode: 'confirmed',
        tenantName: 'Al',
      }),
    ])
    vi.mocked(usersRepo.listAccountsByIds).mockResolvedValue([
      acct(1, 'Zed'),
      acct(2, 'Bea'),
      acct(3, 'Cy'),
      acct(4, 'Al'),
    ])
    const list = await listMyTenants()
    expect(list.map((t) => [t.name, t.phase])).toEqual([
      ['Cy', 'current'],
      ['Al', 'upcoming'],
      ['Bea', 'upcoming'],
      ['Zed', 'past'],
    ])
    expect(list[0].stays.map((s) => s.bookingId)).toEqual([3, 4]) // newest stay first
  })

  it('includes contact details, and falls back to the booking name if the account is missing', async () => {
    vi.mocked(bookings.listManagedBookings).mockResolvedValue([
      b({ tenantId: 7, tenantName: 'Ana (booking)' }),
    ])
    vi.mocked(usersRepo.listAccountsByIds).mockResolvedValue([])
    const [t] = await listMyTenants()
    expect(t).toMatchObject({ name: 'Ana (booking)', email: null, phone: null })

    vi.mocked(usersRepo.listAccountsByIds).mockResolvedValue([acct(7, 'Ana')])
    expect((await listMyTenants())[0]).toMatchObject({
      name: 'Ana',
      email: 'Ana@x.com',
      phone: '097',
    })
  })

  it('returns nothing (and fetches no accounts) when there are no tenants yet', async () => {
    vi.mocked(bookings.listManagedBookings).mockResolvedValue([
      b({ statusCode: 'pending' }),
    ])
    expect(await listMyTenants()).toEqual([])
    expect(usersRepo.listAccountsByIds).not.toHaveBeenCalled()
  })
})
