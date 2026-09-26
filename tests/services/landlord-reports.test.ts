import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  requireRole: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/services/bookings.service', () => ({ listManagedBookings: vi.fn() }))
vi.mock('@/services/payments.service', () => ({ listManagedPayments: vi.fn() }))
vi.mock('@/services/landlord-tenants.service', () => ({
  listMyTenants: vi.fn(),
}))
vi.mock('@/services/landlord-dashboard.service', () => ({
  getLandlordDashboard: vi.fn().mockResolvedValue({
    occupancy: {
      overall: { occupied: 1, bookable: 2, pct: 50 },
      byProperty: [],
    },
    rating: null,
  }),
}))

const bookings = await import('@/services/bookings.service')
const payments = await import('@/services/payments.service')
const { getLandlordReport, exportLandlordCsv, parseRange } =
  await import('@/services/landlord-reports.service')

const now = new Date('2026-09-25T04:00:00Z')
const pay = (over: Record<string, unknown>) =>
  ({
    paymentId: 1,
    bookingId: 1,
    propertyName: 'Sunrise',
    amount: 1000,
    currency: 'PHP',
    methodName: 'GCash',
    statusCode: 'paid',
    statusName: 'Paid',
    reference: null,
    submittedAt: '2026-09-02T00:00:00Z',
    paidAt: '2026-09-02T00:00:00Z',
    payerName: 'Ana',
    ...over,
  }) as never
const book = (over: Record<string, unknown>) =>
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
    totalAmount: 3000,
    currency: 'PHP',
    submittedAt: '2026-09-01T00:00:00Z',
    tenantName: 'Ana',
    ...over,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(payments.listManagedPayments).mockResolvedValue([
    pay({ paymentId: 1, amount: 1000 }),
    pay({ paymentId: 2, amount: 500, propertyName: 'Moonlight' }),
    pay({
      paymentId: 3,
      amount: 700,
      statusCode: 'pending',
      statusName: 'Pending',
    }),
    pay({
      paymentId: 4,
      amount: 9999,
      paidAt: '2024-01-01T00:00:00Z',
      submittedAt: '2024-01-01T00:00:00Z',
    }),
  ])
  vi.mocked(bookings.listManagedBookings).mockResolvedValue([
    book({ bookingId: 1, totalAmount: 3000 }),
    book({ bookingId: 2, totalAmount: 5000, statusCode: 'checked_in' }),
    book({ bookingId: 3, statusCode: 'pending' }),
  ])
})

describe('getLandlordReport', () => {
  it('counts only verified payments inside the period, per property', async () => {
    const r = await getLandlordReport(6, now)
    expect(r.revenue.total).toBe(1500)
    expect(r.revenue.byProperty).toEqual([
      { name: 'Sunrise', amount: 1000, payments: 1 },
      { name: 'Moonlight', amount: 500, payments: 1 },
    ])
    expect(r.revenue.pendingAmount).toBe(700)
  })

  it('averages only confirmed / staying / finished bookings', async () => {
    const r = await getLandlordReport(6, now)
    expect(r.bookings.averageValue).toBe(4000)
    expect(r.bookings.inRange).toBe(3)
  })
})

describe('parseRange', () => {
  it('accepts 3 / 6 / 12 and falls back to 6', () => {
    expect(parseRange('12')).toBe(12)
    expect(parseRange('99')).toBe(6)
    expect(parseRange(undefined)).toBe(6)
  })
})

describe('exportLandlordCsv', () => {
  it('filters by Manila day and rejects bad dates', async () => {
    const { csv } = await exportLandlordCsv('payments', {
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(csv).toContain('Sunrise')
    expect(csv).not.toContain('9999')
    await expect(
      exportLandlordCsv('payments', { from: 'yesterday' }),
    ).rejects.toThrow('valid dates')
  })
})
