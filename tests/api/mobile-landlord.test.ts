import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every service is mocked: these tests are about WHO can reach which endpoint and what reaches the service.
vi.mock('@/lib/auth/dal', () => ({
  getCurrentUser: vi.fn(),
  getSessionAuthMethods: vi.fn().mockResolvedValue(['password']),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))
vi.mock('@/repositories/users.repository', () => ({ getAccountById: vi.fn() }))
vi.mock('@/services/bookings.service', () => ({
  listManagedBookings: vi.fn(),
  getManagedBooking: vi.fn(),
  transitionManagedBooking: vi.fn(),
}))
vi.mock('@/services/mobile-messaging.service', () => ({
  listEligibleConversations: vi.fn(),
  listMobileConversations: vi.fn(),
  getMobileThread: vi.fn(),
  sendMobileMessage: vi.fn(),
}))
vi.mock('@/services/landlord-dashboard.service', () => ({
  getLandlordDashboard: vi.fn(),
}))
vi.mock('@/services/notifications.service', () => ({
  getUnreadCount: vi.fn(),
  listMyNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))
vi.mock('@/services/ratings.service', () => ({
  listManagedReviews: vi.fn(),
  respondToReview: vi.fn(),
}))
vi.mock('@/services/landlord-tenants.service', () => ({
  listMyTenants: vi.fn(),
}))
vi.mock('@/services/landlord-properties.service', () => ({
  listMyPropertySummaries: vi.fn(),
  getMyPropertyDetail: vi.fn(),
  getPropertyFormChoices: vi.fn(),
}))
vi.mock('@/services/properties.service', () => ({
  createProperty: vi.fn(),
  updateProperty: vi.fn(),
  setPropertyAmenities: vi.fn(),
}))
vi.mock('@/services/rooms.service', () => ({ createRoom: vi.fn() }))
vi.mock('@/services/beds.service', () => ({
  createBed: vi.fn(),
  deleteBed: vi.fn(),
}))
vi.mock('@/services/rental-rates.service', () => ({
  createRate: vi.fn(),
  deleteRate: vi.fn(),
}))

const { getCurrentUser, getSessionAuthMethods } = await import('@/lib/auth/dal')
const bookings = await import('@/services/bookings.service')
const messaging = await import('@/services/mobile-messaging.service')
const dashboardSvc = await import('@/services/landlord-dashboard.service')
const notif = await import('@/services/notifications.service')
const ratings = await import('@/services/ratings.service')
const usersRepo = await import('@/repositories/users.repository')
const propsSvc = await import('@/services/properties.service')
const roomsSvc = await import('@/services/rooms.service')
const bedsSvc = await import('@/services/beds.service')
const ratesSvc = await import('@/services/rental-rates.service')

const routes = {
  dashboard: await import('@/app/api/mobile/landlord/dashboard/route'),
  bookings: await import('@/app/api/mobile/landlord/bookings/route'),
  booking: await import('@/app/api/mobile/landlord/bookings/[id]/route'),
  action: await import('@/app/api/mobile/landlord/bookings/[id]/action/route'),
  reviews: await import('@/app/api/mobile/landlord/reviews/route'),
  respond: await import('@/app/api/mobile/landlord/reviews/[id]/respond/route'),
  tenants: await import('@/app/api/mobile/landlord/tenants/route'),
  properties: await import('@/app/api/mobile/landlord/properties/route'),
  property: await import('@/app/api/mobile/landlord/properties/[id]/route'),
  rooms: await import('@/app/api/mobile/landlord/properties/[id]/rooms/route'),
  beds: await import('@/app/api/mobile/landlord/properties/[id]/rooms/[roomId]/beds/route'),
  rates: await import('@/app/api/mobile/landlord/properties/[id]/rates/route'),
  notifications: await import('@/app/api/mobile/notifications/route'),
  read: await import('@/app/api/mobile/notifications/read/route'),
  conversations: await import('@/app/api/mobile/conversations/route'),
  thread:
    await import('@/app/api/mobile/conversations/[propertyId]/[userId]/route'),
}

const person = (roles: string[]) => ({
  authUserId: 'u',
  legacyUserId: 100,
  email: 'l@x.com',
  fullName: 'L',
  phone: null,
  address: null,
  avatarUrl: null,
  isActive: true,
  roles,
})
const req = (body?: unknown, url = 'http://x/api/mobile/x') =>
  new Request(
    url,
    body === undefined
      ? undefined
      : { method: 'POST', body: JSON.stringify(body) },
  )
const ctx = (params: Record<string, string> = {}) =>
  ({ params: Promise.resolve(params) }) as never
const ok = async (res: Response) => (await res.json()).data

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getSessionAuthMethods).mockResolvedValue(['password'])
  vi.mocked(getCurrentUser).mockResolvedValue(person(['landlord']) as never)
})

describe('landlord-only endpoints refuse everyone else', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['dashboard', () => routes.dashboard.GET(req(), ctx())],
    ['bookings', () => routes.bookings.GET(req(), ctx())],
    ['booking', () => routes.booking.GET(req(), ctx({ id: '1' }))],
    [
      'booking action',
      () =>
        routes.action.POST(req({ to: 'payment_pending' }), ctx({ id: '1' })),
    ],
    ['reviews', () => routes.reviews.GET(req(), ctx())],
    [
      'respond',
      () => routes.respond.POST(req({ response: 'Thanks' }), ctx({ id: '1' })),
    ],
    ['tenants', () => routes.tenants.GET(req(), ctx())],
    ['properties list', () => routes.properties.GET(req(), ctx())],
    [
      'property create',
      () => routes.properties.POST(req({ property_name: 'X' }), ctx()),
    ],
    ['property update', () => routes.property.PATCH(req({}), ctx({ id: '1' }))],
    ['room create', () => routes.rooms.POST(req({}), ctx({ id: '1' }))],
    [
      'bed create',
      () => routes.beds.POST(req({}), ctx({ id: '1', roomId: '2' })),
    ],
    ['rate create', () => routes.rates.POST(req({}), ctx({ id: '1' }))],
  ]

  it.each(calls)(
    '%s: a TENANT gets 403 and no service runs',
    async (_name, call) => {
      vi.mocked(getCurrentUser).mockResolvedValue(person(['tenant']) as never)
      const res = await call()
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe('wrong_role')
      for (const fn of [
        bookings.transitionManagedBooking,
        propsSvc.createProperty,
        propsSvc.updateProperty,
        roomsSvc.createRoom,
        bedsSvc.createBed,
        ratesSvc.createRate,
        ratings.respondToReview,
      ]) {
        expect(fn).not.toHaveBeenCalled()
      }
    },
  )

  it.each(calls)('%s: signed-out gets 401', async (_name, call) => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })

  it.each(calls)(
    '%s: a landlord who signed in with GOOGLE gets 403',
    async (_name, call) => {
      vi.mocked(getSessionAuthMethods).mockResolvedValue(['oauth'])
      const res = await call()
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe('landlord_no_google')
    },
  )
})

describe('bookings: accept / reject', () => {
  it('passes the decision through to the service exactly as the website does', async () => {
    const res = await routes.action.POST(
      req({ to: 'payment_pending', response: 'Welcome!' }),
      ctx({ id: '12' }),
    )
    expect(res.status).toBe(200)
    expect(bookings.transitionManagedBooking).toHaveBeenCalledWith(12, {
      to: 'payment_pending',
      response: 'Welcome!',
    })
  })

  it("surfaces the service's refusal (e.g. not allowed from this status) as a readable 409", async () => {
    const { ServiceError } = await import('@/services/errors')
    vi.mocked(bookings.transitionManagedBooking).mockRejectedValue(
      new ServiceError(
        'That change is not allowed for this booking.',
        'conflict',
      ),
    )
    const res = await routes.action.POST(
      req({ to: 'checked_in' }),
      ctx({ id: '12' }),
    )
    expect(res.status).toBe(409)
  })

  it('lists only the requested status, ignoring unknown values', async () => {
    vi.mocked(bookings.listManagedBookings).mockResolvedValue([])
    await routes.bookings.GET(
      req(undefined, 'http://x/api/mobile/landlord/bookings?status=pending'),
      ctx(),
    )
    expect(bookings.listManagedBookings).toHaveBeenLastCalledWith(
      'landlord',
      'pending',
    )
    await routes.bookings.GET(
      req(
        undefined,
        'http://x/api/mobile/landlord/bookings?status=%27%3B%20drop',
      ),
      ctx(),
    )
    expect(bookings.listManagedBookings).toHaveBeenLastCalledWith(
      'landlord',
      undefined,
    )
  })
})

describe('booking detail hides the tenant until the booking is confirmed and paid', () => {
  const detail = {
    bookingId: 5,
    tenantId: 7,
    propertyId: 1,
    propertyOwnerId: 100,
    tenantName: 'Ana',
    statusCode: 'pending',
  }

  it('shows NO contact details and no messaging for a pending request', async () => {
    vi.mocked(bookings.getManagedBooking).mockResolvedValue(detail as never)
    vi.mocked(messaging.listEligibleConversations).mockResolvedValue([])
    const data = await ok(await routes.booking.GET(req(), ctx({ id: '5' })))
    expect(data.canMessage).toBe(false)
    expect(data.tenantContact).toBeNull()
    expect(usersRepo.getAccountById).not.toHaveBeenCalled()
    expect(data).not.toHaveProperty('propertyOwnerId')
  })

  it('reveals email + phone and allows messaging once confirmed and paid', async () => {
    vi.mocked(bookings.getManagedBooking).mockResolvedValue({
      ...detail,
      statusCode: 'confirmed',
    } as never)
    vi.mocked(messaging.listEligibleConversations).mockResolvedValue([
      { otherUserId: 7, propertyId: 1 },
    ])
    vi.mocked(usersRepo.getAccountById).mockResolvedValue({
      email: 'ana@x.com',
      phone: '0917',
    } as never)
    const data = await ok(await routes.booking.GET(req(), ctx({ id: '5' })))
    expect(data.canMessage).toBe(true)
    expect(data.tenantContact).toEqual({ email: 'ana@x.com', phone: '0917' })
  })
})

describe('dashboard', () => {
  it('adds pending / awaiting-payment / confirmed / checked-in counts and unread notifications', async () => {
    vi.mocked(dashboardSvc.getLandlordDashboard).mockResolvedValue({
      bookings: {
        byStatus: [
          { code: 'pending', label: 'Pending', count: 3 },
          { code: 'payment_pending', label: 'x', count: 2 },
          { code: 'confirmed', label: 'x', count: 4 },
          { code: 'checked_in', label: 'x', count: 5 },
          { code: 'cancelled', label: 'x', count: 9 },
        ],
        total: 23,
        awaitingReply: 3,
      },
    } as never)
    vi.mocked(notif.getUnreadCount).mockResolvedValue(6)
    const data = await ok(await routes.dashboard.GET(req(), ctx()))
    expect(data.counts).toEqual({
      pendingRequests: 3,
      awaitingPayment: 2,
      confirmed: 4,
      checkedIn: 5,
    })
    expect(data.unreadNotifications).toBe(6)
  })
})

describe('properties', () => {
  it('creates a property from the website-shaped body and returns its id', async () => {
    vi.mocked(propsSvc.createProperty).mockResolvedValue({
      property_id: 41,
    } as never)
    const body = { property_name: 'Sunrise', address: '12 Mango Ave, Cebu' }
    const res = await routes.properties.POST(req(body), ctx())
    expect(await ok(res)).toEqual({ propertyId: 41 })
    expect(propsSvc.createProperty).toHaveBeenCalledWith(body)
  })

  it('passes a plan-limit refusal through as a readable error', async () => {
    const { ServiceError } = await import('@/services/errors')
    vi.mocked(propsSvc.createProperty).mockRejectedValue(
      new ServiceError('Your plan allows 1 property.', 'conflict'),
    )
    const res = await routes.properties.POST(req({}), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toBe(
      'Your plan allows 1 property.',
    )
  })

  it('adds rooms, beds and rates to the right property', async () => {
    vi.mocked(roomsSvc.createRoom).mockResolvedValue({ room_id: 8 } as never)
    vi.mocked(bedsSvc.createBed).mockResolvedValue({ bed_id: 9 } as never)
    vi.mocked(ratesSvc.createRate).mockResolvedValue({ rate_id: 10 } as never)
    expect(
      await ok(
        await routes.rooms.POST(req({ max_occupants: 4 }), ctx({ id: '41' })),
      ),
    ).toEqual({ roomId: 8 })
    expect(
      await ok(
        await routes.beds.POST(
          req({ bed_number: '1' }),
          ctx({ id: '41', roomId: '8' }),
        ),
      ),
    ).toEqual({ bedId: 9 })
    expect(
      await ok(
        await routes.rates.POST(
          req({
            room_id: 8,
            period: 'monthly',
            price: 4500,
            valid_from: '2026-10-01',
          }),
          ctx({ id: '41' }),
        ),
      ),
    ).toEqual({ rateId: 10 })
    expect(roomsSvc.createRoom).toHaveBeenCalledWith(41, { max_occupants: 4 })
    expect(bedsSvc.createBed).toHaveBeenCalledWith(41, 8, { bed_number: '1' })
  })

  it('rejects a non-numeric property id', async () => {
    expect(
      (await routes.property.PATCH(req({}), ctx({ id: 'abc' }))).status,
    ).toBe(404)
  })
})

describe('messages: both roles, eligible conversations only', () => {
  it('serves tenants AND landlords', async () => {
    vi.mocked(messaging.listMobileConversations).mockResolvedValue([
      { unread: 2 },
      { unread: 3 },
    ] as never)
    for (const role of ['tenant', 'landlord']) {
      vi.mocked(getCurrentUser).mockResolvedValue(person([role]) as never)
      const data = await ok(await routes.conversations.GET(req(), ctx()))
      expect(data.unread).toBe(5)
    }
  })

  it('sends only the message text — the caller cannot choose a sender', async () => {
    await routes.thread.POST(
      req({ message: 'Hello', sender_id: 999 }),
      ctx({ propertyId: '1', userId: '7' }),
    )
    expect(messaging.sendMobileMessage).toHaveBeenCalledWith(7, 1, 'Hello')
  })

  it('a refusal for a not-yet-paid booking is a readable 403', async () => {
    const { ServiceError } = await import('@/services/errors')
    vi.mocked(messaging.getMobileThread).mockRejectedValue(
      new ServiceError(
        'Messaging opens once a booking is confirmed and paid.',
        'forbidden',
      ),
    )
    const res = await routes.thread.GET(
      req(),
      ctx({ propertyId: '1', userId: '7' }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toMatch(/confirmed and paid/)
  })
})

describe('notifications', () => {
  it('marks one or all read, scoped by the service to the caller', async () => {
    await routes.read.POST(req({ id: 4 }), ctx())
    expect(notif.markNotificationRead).toHaveBeenCalledWith(4)
    await routes.read.POST(req({}), ctx())
    expect(notif.markAllNotificationsRead).toHaveBeenCalledOnce()
  })
})

describe('reviews', () => {
  it('computes the average and lets the landlord respond', async () => {
    vi.mocked(ratings.listManagedReviews).mockResolvedValue([
      { rating: 5 },
      { rating: 4 },
      { rating: 4 },
    ] as never)
    expect((await ok(await routes.reviews.GET(req(), ctx()))).average).toBe(4.3)
    await routes.respond.POST(req({ response: 'Thank you!' }), ctx({ id: '3' }))
    expect(ratings.respondToReview).toHaveBeenCalledWith(3, {
      response: 'Thank you!',
    })
  })
})
