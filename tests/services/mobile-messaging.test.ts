import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listBookingStatuses: vi.fn().mockResolvedValue([
    { booking_status_id: 1, status_code: 'pending' },
    { booking_status_id: 2, status_code: 'payment_pending' },
    { booking_status_id: 3, status_code: 'confirmed' },
    { booking_status_id: 4, status_code: 'checked_in' },
    { booking_status_id: 5, status_code: 'checked_out' },
    { booking_status_id: 6, status_code: 'cancelled' },
  ]),
  listPaymentStatuses: vi.fn().mockResolvedValue([
    { payment_status_id: 10, status_code: 'pending' },
    { payment_status_id: 11, status_code: 'paid' },
    { payment_status_id: 12, status_code: 'failed' },
  ]),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  listBookingsByUser: vi.fn(),
  listBookingsByProperties: vi.fn(),
  tenantNamesByIds: vi.fn().mockResolvedValue(new Map()),
  propertyNamesByIds: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('@/repositories/payments.repository', () => ({
  listPaymentsByBookings: vi.fn(),
}))
vi.mock('@/repositories/properties.repository', () => ({
  listProperties: vi.fn(),
  listPropertiesByIds: vi.fn(),
}))
vi.mock('@/repositories/messaging.repository', () => ({
  listMessagesForUser: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/services/messaging.service', () => ({
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
}))

const { requireUser } = await import('@/lib/auth/dal')
const bookingsRepo = await import('@/repositories/bookings.repository')
const paymentsRepo = await import('@/repositories/payments.repository')
const propertiesRepo = await import('@/repositories/properties.repository')
const messagingRepo = await import('@/repositories/messaging.repository')
const web = await import('@/services/messaging.service')
const svc = await import('@/services/mobile-messaging.service')

const landlord = { legacyUserId: 100, roles: ['landlord'] }
const tenant = { legacyUserId: 7, roles: ['tenant'] }

const booking = (
  id: number,
  userId: number,
  propertyId: number,
  statusId: number,
) =>
  ({
    booking_id: id,
    user_id: userId,
    property_id: propertyId,
    booking_status_id: statusId,
  }) as never
const payment = (bookingId: number, statusId: number) =>
  ({
    payment_id: bookingId * 10,
    booking_id: bookingId,
    payment_status_id: statusId,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(propertiesRepo.listProperties).mockResolvedValue([
    { property_id: 1 },
  ] as never)
  vi.mocked(propertiesRepo.listPropertiesByIds).mockResolvedValue([
    { property_id: 1, property_owner: 100 },
  ] as never)
  vi.mocked(messagingRepo.listMessagesForUser).mockResolvedValue([])
})

describe('who can message whom (landlord view)', () => {
  beforeEach(() => vi.mocked(requireUser).mockResolvedValue(landlord as never))

  it('offers a conversation for a CONFIRMED booking with a PAID payment', async () => {
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
      booking(1, 7, 1, 3),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      payment(1, 11),
    ])
    expect(await svc.listEligibleConversations()).toEqual([
      { otherUserId: 7, propertyId: 1 },
    ])
  })

  it('also allows a tenant who has since checked in', async () => {
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
      booking(1, 7, 1, 4),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      payment(1, 11),
    ])
    expect(await svc.listEligibleConversations()).toHaveLength(1)
  })

  it.each([
    ['pending request', 1],
    ['approved but unpaid', 2],
    ['checked out (stay is over)', 5],
    ['cancelled', 6],
  ])(
    'offers NO conversation for a %s booking, even with a paid payment on file',
    async (_l, statusId) => {
      vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
        booking(1, 7, 1, statusId),
      ])
      vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
        payment(1, 11),
      ])
      expect(await svc.listEligibleConversations()).toEqual([])
    },
  )

  it('offers NO conversation when the booking is confirmed but no PAID payment exists', async () => {
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
      booking(1, 7, 1, 3),
    ])
    for (const payments of [[], [payment(1, 10)], [payment(1, 12)]]) {
      vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue(payments)
      expect(await svc.listEligibleConversations()).toEqual([])
    }
  })

  it('lists one conversation per tenant+property even with several qualifying bookings', async () => {
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
      booking(1, 7, 1, 3),
      booking(2, 7, 1, 4),
      booking(3, 8, 1, 3),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      payment(1, 11),
      payment(2, 11),
      payment(3, 11),
    ])
    const got = await svc.listEligibleConversations()
    expect(got.map((c) => c.otherUserId).sort()).toEqual([7, 8])
  })

  it('never includes bookings at properties the landlord does not own', async () => {
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([])
    await svc.listEligibleConversations()
    expect(bookingsRepo.listBookingsByProperties).toHaveBeenCalledWith([1]) // only their own property ids
    expect(bookingsRepo.listBookingsByUser).not.toHaveBeenCalled()
  })
})

describe('who can message whom (tenant view)', () => {
  beforeEach(() => vi.mocked(requireUser).mockResolvedValue(tenant as never))

  it("pairs a tenant with the property's owner once confirmed and paid", async () => {
    vi.mocked(bookingsRepo.listBookingsByUser).mockResolvedValue([
      booking(1, 7, 1, 3),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      payment(1, 11),
    ])
    expect(await svc.listEligibleConversations()).toEqual([
      { otherUserId: 100, propertyId: 1 },
    ])
  })

  it('offers nothing for an unpaid approval', async () => {
    vi.mocked(bookingsRepo.listBookingsByUser).mockResolvedValue([
      booking(1, 7, 1, 2),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([])
    expect(await svc.listEligibleConversations()).toEqual([])
  })
})

describe('reading and sending', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(landlord as never)
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
      booking(1, 7, 1, 3),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      payment(1, 11),
    ])
  })

  it('opens a thread and sends for an eligible pair', async () => {
    vi.mocked(web.getConversation).mockResolvedValue({
      meta: {} as never,
      messages: [],
    })
    await svc.getMobileThread(7, 1)
    await svc.sendMobileMessage(7, 1, 'Welcome!')
    expect(web.sendMessage).toHaveBeenCalledWith({
      receiver_id: 7,
      property_id: 1,
      message: 'Welcome!',
    })
  })

  it('REFUSES to read or send to anyone else, and never reaches the underlying chat', async () => {
    await expect(svc.getMobileThread(8, 1)).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(svc.sendMobileMessage(7, 2, 'hi')).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(web.getConversation).not.toHaveBeenCalled()
    expect(web.sendMessage).not.toHaveBeenCalled()
  })
})

describe('conversation list', () => {
  it('shows every eligible pair, newest activity first, with unread counts', async () => {
    vi.mocked(requireUser).mockResolvedValue(landlord as never)
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
      booking(1, 7, 1, 3),
      booking(2, 8, 1, 3),
      booking(3, 9, 1, 3),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      payment(1, 11),
      payment(2, 11),
      payment(3, 11),
    ])
    vi.mocked(bookingsRepo.tenantNamesByIds).mockResolvedValue(
      new Map([
        [7, 'Ana'],
        [8, 'Ben'],
        [9, 'Cy'],
      ]),
    )
    vi.mocked(messagingRepo.listMessagesForUser).mockResolvedValue([
      {
        sender_id: 7,
        receiver_id: 100,
        property_id: 1,
        message: 'old',
        created_at: '2026-09-01T00:00:00Z',
        is_read: true,
      },
      {
        sender_id: 8,
        receiver_id: 100,
        property_id: 1,
        message: 'new',
        created_at: '2026-09-20T00:00:00Z',
        is_read: false,
      },
      {
        sender_id: 8,
        receiver_id: 100,
        property_id: 1,
        message: 'newer',
        created_at: '2026-09-21T00:00:00Z',
        is_read: false,
      },
    ] as never)
    const list = await svc.listMobileConversations()
    expect(list.map((c) => c.otherName)).toEqual(['Ben', 'Ana', 'Cy']) // Cy has no messages yet: last
    expect(list[0]).toMatchObject({ lastMessage: 'newer', unread: 2 })
    expect(list[2]).toMatchObject({ lastMessage: null, unread: 0 })
  })

  it('ignores messages from people the caller is no longer allowed to message', async () => {
    vi.mocked(requireUser).mockResolvedValue(landlord as never)
    vi.mocked(bookingsRepo.listBookingsByProperties).mockResolvedValue([
      booking(1, 7, 1, 3),
    ])
    vi.mocked(paymentsRepo.listPaymentsByBookings).mockResolvedValue([
      payment(1, 11),
    ])
    vi.mocked(messagingRepo.listMessagesForUser).mockResolvedValue([
      {
        sender_id: 55,
        receiver_id: 100,
        property_id: 1,
        message: 'from an inquiry only',
        created_at: '2026-09-21T00:00:00Z',
        is_read: false,
      },
    ] as never)
    const list = await svc.listMobileConversations()
    expect(list).toHaveLength(1)
    expect(list[0].otherUserId).toBe(7)
  })
})
