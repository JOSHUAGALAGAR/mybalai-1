import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'
import type { AppRole } from '@/lib/auth/roles'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/services/property-access', () => ({
  requireManageableProperty: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listBookingStatuses: vi.fn(),
}))
vi.mock('@/repositories/discovery.repository', () => ({
  getVisibleProperty: vi.fn(),
  reviewerNames: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  listBookingsByUser: vi.fn(),
  propertyNamesByIds: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('@/repositories/properties.repository', () => ({
  listProperties: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/messaging.repository', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/repositories/ratings.repository', () => ({
  getUserRating: vi.fn().mockResolvedValue(null),
  getRating: vi.fn(),
  upsertRating: vi.fn().mockResolvedValue({}),
  listRatingsByUser: vi.fn().mockResolvedValue([]),
  listRatingsByProperties: vi.fn().mockResolvedValue([]),
  respondToRating: vi.fn().mockResolvedValue(undefined),
}))

const { requireUser } = await import('@/lib/auth/dal')
const access = await import('@/services/property-access')
const refRepo = await import('@/repositories/reference.repository')
const discoveryRepo = await import('@/repositories/discovery.repository')
const bookingsRepo = await import('@/repositories/bookings.repository')
const messagingRepo = await import('@/repositories/messaging.repository')
const ratingsRepo = await import('@/repositories/ratings.repository')
const service = await import('@/services/ratings.service')

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
  vi.mocked(discoveryRepo.getVisibleProperty).mockResolvedValue({
    property_id: 1,
    property_name: 'P',
    property_owner: 500,
  } as never)
  vi.mocked(refRepo.listBookingStatuses).mockResolvedValue([
    { booking_status_id: 4, status_code: 'checked_out' },
    { booking_status_id: 1, status_code: 'pending' },
  ] as never)
  vi.mocked(bookingsRepo.listBookingsByUser).mockResolvedValue([
    { property_id: 1, booking_status_id: 4 },
  ] as never)
})

describe('submitRating', () => {
  it('rejects a landlord', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    await expect(service.submitRating(1, { rating: 5 })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('rejects a tenant with no qualifying stay', async () => {
    asUser.mockResolvedValue(user(['tenant']))
    vi.mocked(bookingsRepo.listBookingsByUser).mockResolvedValue([
      { property_id: 1, booking_status_id: 1 },
    ] as never)
    await expect(service.submitRating(1, { rating: 5 })).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(ratingsRepo.upsertRating).not.toHaveBeenCalled()
  })

  it('upserts and notifies the owner after a completed stay', async () => {
    asUser.mockResolvedValue(user(['tenant'], 900))
    await service.submitRating(1, { rating: '4', review: 'Great' })
    expect(ratingsRepo.upsertRating).toHaveBeenCalledWith({
      property_id: 1,
      user_id: 900,
      rating: 4,
      review: 'Great',
    })
    expect(messagingRepo.notify).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 500, notification_type: 'REVIEW' }),
    )
  })
})

describe('getRatingContext', () => {
  it('reports canRate for a tenant who has stayed', async () => {
    asUser.mockResolvedValue(user(['tenant']))
    const ctx = await service.getRatingContext(1)
    expect(ctx.canRate).toBe(true)
    expect(ctx.propertyName).toBe('P')
  })
})

describe('respondToReview', () => {
  it('404s an unknown review', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    vi.mocked(ratingsRepo.getRating).mockResolvedValue(null)
    await expect(
      service.respondToReview(7, { response: 'Thanks' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('authorizes the property then records the response', async () => {
    asUser.mockResolvedValue(user(['landlord'], 500))
    vi.mocked(ratingsRepo.getRating).mockResolvedValue({
      rating_id: 7,
      property_id: 1,
      user_id: 900,
    } as never)
    await service.respondToReview(7, { response: 'Thanks for staying' })
    expect(access.requireManageableProperty).toHaveBeenCalledWith(1)
    expect(ratingsRepo.respondToRating).toHaveBeenCalledWith(7, {
      landlord_response: 'Thanks for staying',
      landlord_response_by: 500,
    })
    expect(messagingRepo.notify).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 900 }),
    )
  })
})
