import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi.fn(),
  getSessionAuthMethods: vi.fn(),
  getPasswordAuthAgeSeconds: vi.fn(),
  invalidateCurrentUser: vi.fn(),
}))
vi.mock('@/repositories/account-deletion.repository', () => ({
  countActiveBookings: vi.fn(),
  listOwnedPropertyIds: vi.fn(),
  listIdFilePaths: vi.fn(),
  deleteIdVerifications: vi.fn(),
  deleteNotifications: vi.fn(),
  deleteMessagesSentBy: vi.fn(),
  deleteInquiriesBy: vi.fn(),
  deleteReviewsBy: vi.fn(),
  deleteTenantProfile: vi.fn(),
  deleteLandlordProfile: vi.fn(),
  anonymizeAccount: vi.fn(),
  deleteAuthUser: vi.fn(),
}))
vi.mock('@/repositories/profile-photo.repository', () => ({
  currentAvatarUrl: vi.fn(),
  pathFromPublicUrl: vi.fn(),
  removeObjects: vi.fn(),
}))
vi.mock('@/repositories/properties.repository', () => ({
  softDeleteProperty: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  listBookingStatuses: vi.fn(),
}))
vi.mock('@/repositories/verification.repository', () => ({
  removeObjects: vi.fn(),
}))

const dal = await import('@/lib/auth/dal')
const repo = await import('@/repositories/account-deletion.repository')
const photo = await import('@/repositories/profile-photo.repository')
const props = await import('@/repositories/properties.repository')
const ref = await import('@/repositories/reference.repository')
const ver = await import('@/repositories/verification.repository')
const svc = await import('@/services/account-deletion.service')

const user = (roles: string[]) =>
  ({ legacyUserId: 7, authUserId: 'auth-7', roles }) as never
const asUser = (roles: string[]) =>
  vi.mocked(dal.requireUser).mockResolvedValue(user(roles))

// call order across repositories, to prove the safe sequence
const order: string[] = []
const track = (name: string, fn: ReturnType<typeof vi.fn>) =>
  fn.mockImplementation(async () => {
    order.push(name)
  })

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  vi.mocked(ref.listBookingStatuses).mockResolvedValue([
    { booking_status_id: 1, status_code: 'pending' },
    { booking_status_id: 2, status_code: 'payment_pending' },
    { booking_status_id: 3, status_code: 'confirmed' },
    { booking_status_id: 4, status_code: 'checked_in' },
    { booking_status_id: 5, status_code: 'checked_out' },
    { booking_status_id: 6, status_code: 'cancelled' },
  ] as never)
  vi.mocked(repo.countActiveBookings).mockResolvedValue(0)
  vi.mocked(repo.listIdFilePaths).mockResolvedValue([
    'identity/7/f.jpg',
    'identity/7/b.jpg',
  ])
  vi.mocked(repo.listOwnedPropertyIds).mockResolvedValue([])
  vi.mocked(photo.currentAvatarUrl).mockResolvedValue('https://cdn/x')
  vi.mocked(photo.pathFromPublicUrl).mockReturnValue('avatars/7/a.jpg')
  vi.mocked(dal.getSessionAuthMethods).mockResolvedValue(['password'])
  vi.mocked(dal.getPasswordAuthAgeSeconds).mockResolvedValue(20)
  track('files', vi.mocked(ver.removeObjects))
  track('avatar', vi.mocked(photo.removeObjects))
  track('idRows', vi.mocked(repo.deleteIdVerifications))
  track('notifications', vi.mocked(repo.deleteNotifications))
  track('messages', vi.mocked(repo.deleteMessagesSentBy))
  track('inquiries', vi.mocked(repo.deleteInquiriesBy))
  track('reviews', vi.mocked(repo.deleteReviewsBy))
  track('tenantProfile', vi.mocked(repo.deleteTenantProfile))
  track('anonymize', vi.mocked(repo.anonymizeAccount))
  track('authUser', vi.mocked(repo.deleteAuthUser))
})

describe('who can delete', () => {
  it.each([['superadmin'], ['caretaker'], ['nobody']])(
    'a %s account cannot use this',
    async (role) => {
      asUser([role])
      await expect(svc.checkAccountDeletion()).rejects.toMatchObject({
        code: 'forbidden',
      })
      await expect(
        svc.deleteMyAccount({ confirm: 'DELETE' }),
      ).rejects.toMatchObject({ code: 'forbidden' })
      expect(repo.anonymizeAccount).not.toHaveBeenCalled()
    },
  )
})

describe('checkAccountDeletion', () => {
  it('a tenant with nothing in progress can delete', async () => {
    asUser(['tenant'])
    expect(await svc.checkAccountDeletion()).toEqual({
      role: 'tenant',
      canDelete: true,
      blockers: [],
    })
    // only bookings still in progress count
    expect(repo.countActiveBookings).toHaveBeenCalledWith(
      { tenantId: 7 },
      [1, 2, 3, 4],
    )
  })
  it('a tenant with active bookings is told which and why', async () => {
    asUser(['tenant'])
    vi.mocked(repo.countActiveBookings).mockResolvedValue(2)
    const c = await svc.checkAccountDeletion()
    expect(c.canDelete).toBe(false)
    expect(c.blockers[0]).toMatch(/2 of your bookings are still in progress/)
  })
  it('a landlord is blocked by bookings on their properties', async () => {
    asUser(['landlord'])
    vi.mocked(repo.countActiveBookings).mockResolvedValue(1)
    const c = await svc.checkAccountDeletion()
    expect(repo.countActiveBookings).toHaveBeenCalledWith(
      { landlordId: 7 },
      [1, 2, 3, 4],
    )
    expect(c).toMatchObject({ role: 'landlord', canDelete: false })
    expect(c.blockers[0]).toMatch(
      /1 booking on your properties is still in progress/,
    )
  })
})

describe('deleteMyAccount — safety checks come first', () => {
  it('must be typed out', async () => {
    asUser(['tenant'])
    for (const bad of [
      {},
      { confirm: '' },
      { confirm: 'yes' },
      { confirm: 'DEL' },
    ]) {
      await expect(svc.deleteMyAccount(bad)).rejects.toMatchObject({
        code: 'validation',
      })
    }
    await expect(
      svc.deleteMyAccount({ confirm: ' delete ' }),
    ).resolves.toBeUndefined() // case/space-insensitive
  })
  it('a web (cookie) session is refused', async () => {
    asUser(['tenant'])
    vi.mocked(dal.getSessionAuthMethods).mockResolvedValue([])
    await expect(
      svc.deleteMyAccount({ confirm: 'DELETE' }),
    ).rejects.toMatchObject({
      code: 'forbidden',
      message: /from the MyBalai app/,
    })
    expect(repo.anonymizeAccount).not.toHaveBeenCalled()
  })
  it('a web caller that already verified the password can delete without a mobile session', async () => {
    asUser(['tenant'])
    vi.mocked(dal.getSessionAuthMethods).mockResolvedValue([])
    await expect(
      svc.deleteMyAccount({ confirm: 'DELETE' }, { passwordConfirmed: true }),
    ).resolves.toBeUndefined()
    // ...but the typed confirmation and the active-booking rule still apply
    await expect(
      svc.deleteMyAccount({ confirm: 'nope' }, { passwordConfirmed: true }),
    ).rejects.toBeTruthy()
    vi.mocked(repo.countActiveBookings).mockResolvedValue(1)
    await expect(
      svc.deleteMyAccount({ confirm: 'DELETE' }, { passwordConfirmed: true }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
  it('a password sign-in must be fresh (last 5 minutes)', async () => {
    asUser(['tenant'])
    for (const age of [null, 301, 3600]) {
      vi.mocked(dal.getPasswordAuthAgeSeconds).mockResolvedValue(age)
      await expect(
        svc.deleteMyAccount({ confirm: 'DELETE' }),
      ).rejects.toMatchObject({
        code: 'forbidden',
        message: /enter your password again/,
      })
    }
    expect(repo.anonymizeAccount).not.toHaveBeenCalled()
    vi.mocked(dal.getPasswordAuthAgeSeconds).mockResolvedValue(300)
    await expect(
      svc.deleteMyAccount({ confirm: 'DELETE' }),
    ).resolves.toBeUndefined()
  })
  it('a Google (oauth-only) session needs no password, just the typed confirmation', async () => {
    asUser(['tenant'])
    vi.mocked(dal.getSessionAuthMethods).mockResolvedValue(['oauth'])
    vi.mocked(dal.getPasswordAuthAgeSeconds).mockResolvedValue(null)
    await expect(
      svc.deleteMyAccount({ confirm: 'DELETE' }),
    ).resolves.toBeUndefined()
  })
  it('nothing is touched while a booking is in progress', async () => {
    asUser(['tenant'])
    vi.mocked(repo.countActiveBookings).mockResolvedValue(1)
    await expect(
      svc.deleteMyAccount({ confirm: 'DELETE' }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(ver.removeObjects).not.toHaveBeenCalled()
    expect(repo.deleteNotifications).not.toHaveBeenCalled()
    expect(repo.anonymizeAccount).not.toHaveBeenCalled()
    expect(repo.deleteAuthUser).not.toHaveBeenCalled()
  })
})

describe('deleteMyAccount — what happens, in what order', () => {
  it('a tenant: files and personal content first, then anonymise, then delete the login LAST', async () => {
    asUser(['tenant'])
    await svc.deleteMyAccount({ confirm: 'DELETE' })
    expect(ver.removeObjects).toHaveBeenCalledWith([
      'identity/7/f.jpg',
      'identity/7/b.jpg',
    ])
    expect(photo.removeObjects).toHaveBeenCalledWith(['avatars/7/a.jpg'])
    expect(order.indexOf('anonymize')).toBeGreaterThan(order.indexOf('reviews'))
    expect(order.indexOf('authUser')).toBe(order.length - 1) // never before the account row is unlinked
    expect(order.indexOf('authUser')).toBeGreaterThan(
      order.indexOf('anonymize'),
    )
    expect(order).toEqual(
      expect.arrayContaining([
        'files',
        'avatar',
        'idRows',
        'notifications',
        'messages',
        'inquiries',
        'reviews',
        'tenantProfile',
        'anonymize',
        'authUser',
      ]),
    )
    expect(dal.invalidateCurrentUser).toHaveBeenCalledWith('auth-7')
    expect(props.softDeleteProperty).not.toHaveBeenCalled() // a tenant owns no listings
  })

  it('a landlord: listings are taken off, subscription cancelled, profile removed', async () => {
    asUser(['landlord'])
    vi.mocked(repo.listOwnedPropertyIds).mockResolvedValue([10, 11])
    await svc.deleteMyAccount({ confirm: 'DELETE' })
    expect(props.softDeleteProperty).toHaveBeenCalledTimes(2)
    expect(props.softDeleteProperty).toHaveBeenCalledWith(10)
    expect(props.softDeleteProperty).toHaveBeenCalledWith(11)
    expect(repo.deleteLandlordProfile).toHaveBeenCalledWith(7)
  })

  it('a failed step stops before the point of no return (account still intact)', async () => {
    asUser(['tenant'])
    vi.mocked(repo.deleteReviewsBy).mockRejectedValue(new Error('db down'))
    await expect(svc.deleteMyAccount({ confirm: 'DELETE' })).rejects.toThrow(
      'db down',
    )
    expect(repo.anonymizeAccount).not.toHaveBeenCalled()
    expect(repo.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('if removing the login fails, the account is still gone for the user (logged, not thrown)', async () => {
    asUser(['tenant'])
    vi.mocked(repo.deleteAuthUser).mockRejectedValue(new Error('auth api down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      svc.deleteMyAccount({ confirm: 'DELETE' }),
    ).resolves.toBeUndefined()
    expect(repo.anonymizeAccount).toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('no avatar or ID files: nothing to remove, still succeeds', async () => {
    asUser(['tenant'])
    vi.mocked(repo.listIdFilePaths).mockResolvedValue([])
    vi.mocked(photo.pathFromPublicUrl).mockReturnValue(null)
    await svc.deleteMyAccount({ confirm: 'DELETE' })
    expect(photo.removeObjects).not.toHaveBeenCalled()
  })
})
