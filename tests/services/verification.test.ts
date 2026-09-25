import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
  invalidateCurrentUser: vi.fn(),
}))
vi.mock('@/repositories/verification.repository', () => ({
  latestForUser: vi.fn(),
  getById: vi.fn(),
  listByStatus: vi.fn(),
  countByStatus: vi.fn(),
  insertPending: vi.fn(),
  decide: vi.fn(),
  setIdVerifiedAt: vi.fn(),
  getIdVerifiedAt: vi.fn(),
  accountNames: vi.fn(),
  createSignedUpload: vi.fn(),
  objectExists: vi.fn(),
  signedViewUrl: vi.fn(),
  removeObjects: vi.fn(),
}))
vi.mock('@/repositories/messaging.repository', () => ({ notify: vi.fn() }))
vi.mock('@/repositories/users.repository', () => ({ getAccountById: vi.fn() }))

const dal = await import('@/lib/auth/dal')
const repo = await import('@/repositories/verification.repository')
const messaging = await import('@/repositories/messaging.repository')
const users = await import('@/repositories/users.repository')
const svc = await import('@/services/verification.service')
const { newIdPath } = await import('@/lib/identity/rules')

const tenant = { legacyUserId: 7, authUserId: 'auth-7', roles: ['tenant'] }
const admin = { legacyUserId: 1, authUserId: 'auth-1', roles: ['superadmin'] }
const jpg = { name: 'id.jpg', type: 'image/jpeg', size: 200_000 }

const asTenant = () =>
  vi.mocked(dal.requireUser).mockResolvedValue(tenant as never)
const asAdmin = () =>
  vi.mocked(dal.requireRole).mockResolvedValue(admin as never)

const row = (over: object = {}) => ({
  verification_id: 5,
  user_id: 7,
  id_type: 'philsys',
  front_path: 'identity/7/f',
  back_path: 'identity/7/b',
  status: 'pending',
  reject_reason: null,
  submitted_at: '2026-09-25T00:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.latestForUser).mockResolvedValue(null)
  vi.mocked(repo.getIdVerifiedAt).mockResolvedValue(null)
  vi.mocked(repo.createSignedUpload).mockImplementation(async (path) => ({
    path,
    token: `tok-${path.length}`,
  }))
  vi.mocked(repo.objectExists).mockResolvedValue(true)
  vi.mocked(repo.insertPending).mockResolvedValue(row() as never)
  vi.mocked(repo.removeObjects).mockResolvedValue(undefined)
  vi.mocked(messaging.notify).mockResolvedValue(undefined)
})

describe('tenant only', () => {
  it.each([['landlord'], ['caretaker'], ['superadmin']])(
    'a %s cannot use tenant verification',
    async (role) => {
      vi.mocked(dal.requireUser).mockResolvedValue({
        ...tenant,
        roles: [role],
      } as never)
      await expect(svc.getMyVerification()).rejects.toMatchObject({
        code: 'forbidden',
      })
      await expect(
        svc.prepareIdUpload({ idType: 'philsys', front: jpg, back: jpg }),
      ).rejects.toMatchObject({ code: 'forbidden' })
      await expect(
        svc.submitVerification({
          idType: 'philsys',
          frontPath: 'x',
          backPath: 'y',
        }),
      ).rejects.toMatchObject({ code: 'forbidden' })
    },
  )
})

describe('getMyVerification', () => {
  it('none when never submitted', async () => {
    asTenant()
    expect(await svc.getMyVerification()).toMatchObject({
      status: 'none',
      verified: false,
      rejectReason: null,
    })
  })
  it('shows the reason only for a rejection', async () => {
    asTenant()
    vi.mocked(repo.latestForUser).mockResolvedValue(
      row({ status: 'rejected', reject_reason: 'Blurry photo' }) as never,
    )
    expect(await svc.getMyVerification()).toMatchObject({
      status: 'rejected',
      rejectReason: 'Blurry photo',
      idTypeLabel: expect.stringMatching(/National ID/),
    })
    vi.mocked(repo.latestForUser).mockResolvedValue(
      row({ status: 'pending', reject_reason: 'leftover' }) as never,
    )
    expect((await svc.getMyVerification()).rejectReason).toBeNull()
  })
  it('verified reflects the badge timestamp', async () => {
    asTenant()
    vi.mocked(repo.getIdVerifiedAt).mockResolvedValue('2026-09-26T00:00:00Z')
    vi.mocked(repo.latestForUser).mockResolvedValue(
      row({ status: 'approved' }) as never,
    )
    expect(await svc.getMyVerification()).toMatchObject({
      status: 'approved',
      verified: true,
    })
  })
})

describe('prepareIdUpload', () => {
  it('issues one link per side, named by the server for THIS user', async () => {
    asTenant()
    const r = await svc.prepareIdUpload({
      idType: 'philsys',
      front: jpg,
      back: { ...jpg, type: 'image/png' },
    })
    expect(r.front.path).toMatch(/^identity\/7\/.+-front\.jpg$/)
    expect(r.back.path).toMatch(/^identity\/7\/.+-back\.png$/)
  })
  it('refuses a wrong file type or size and says which side', async () => {
    asTenant()
    await expect(
      svc.prepareIdUpload({
        idType: 'philsys',
        front: jpg,
        back: { ...jpg, type: 'application/pdf' },
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { back: [expect.any(String)] },
    })
    await expect(
      svc.prepareIdUpload({
        idType: 'philsys',
        front: { ...jpg, size: 9 * 1024 * 1024 },
        back: jpg,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { front: [expect.stringMatching(/8 MB/)] },
    })
    expect(repo.createSignedUpload).not.toHaveBeenCalled()
  })
  it('refuses an unknown ID type', async () => {
    asTenant()
    await expect(
      svc.prepareIdUpload({ idType: 'library-card', front: jpg, back: jpg }),
    ).rejects.toMatchObject({ code: 'validation' })
  })
  it('no new upload while one is under review or already approved; allowed after a rejection', async () => {
    asTenant()
    vi.mocked(repo.latestForUser).mockResolvedValue(
      row({ status: 'pending' }) as never,
    )
    await expect(
      svc.prepareIdUpload({ idType: 'philsys', front: jpg, back: jpg }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: /already being reviewed/,
    })
    vi.mocked(repo.latestForUser).mockResolvedValue(
      row({ status: 'approved' }) as never,
    )
    await expect(
      svc.prepareIdUpload({ idType: 'philsys', front: jpg, back: jpg }),
    ).rejects.toMatchObject({ code: 'conflict', message: /already verified/ })
    vi.mocked(repo.latestForUser).mockResolvedValue(
      row({ status: 'rejected', reject_reason: 'x' }) as never,
    )
    await expect(
      svc.prepareIdUpload({ idType: 'philsys', front: jpg, back: jpg }),
    ).resolves.toBeDefined()
  })
})

describe('submitVerification', () => {
  const mine = () => ({
    idType: 'philsys',
    frontPath: newIdPath(7, 'front', 'image/jpeg')!,
    backPath: newIdPath(7, 'back', 'image/jpeg')!,
  })

  it('queues the submission for review', async () => {
    asTenant()
    const input = mine()
    vi.mocked(repo.latestForUser)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(row() as never)
    const r = await svc.submitVerification(input)
    expect(repo.insertPending).toHaveBeenCalledWith({
      user_id: 7,
      id_type: 'philsys',
      front_path: input.frontPath,
      back_path: input.backPath,
    })
    expect(r.status).toBe('pending')
  })

  it('refuses files that were issued to another user, or swapped sides', async () => {
    asTenant()
    await expect(
      svc.submitVerification({
        idType: 'philsys',
        frontPath: newIdPath(8, 'front', 'image/jpeg')!,
        backPath: newIdPath(7, 'back', 'image/jpeg')!,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    const m = mine()
    await expect(
      svc.submitVerification({
        idType: 'philsys',
        frontPath: m.backPath,
        backPath: m.frontPath,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    expect(repo.insertPending).not.toHaveBeenCalled()
  })

  it('a file that never arrived: nothing is queued and the leftovers are removed', async () => {
    asTenant()
    vi.mocked(repo.objectExists)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const input = mine()
    await expect(svc.submitVerification(input)).rejects.toMatchObject({
      code: 'conflict',
      message: /did not finish uploading/,
    })
    expect(repo.insertPending).not.toHaveBeenCalled()
    expect(repo.removeObjects).toHaveBeenCalledWith([
      input.frontPath,
      input.backPath,
    ])
  })

  it('two submissions racing: the database refuses the second and we clean up', async () => {
    asTenant()
    const input = mine()
    vi.mocked(repo.insertPending).mockRejectedValue(
      Object.assign(new Error('x'), { cause: { code: '23505' } }),
    )
    await expect(svc.submitVerification(input)).rejects.toMatchObject({
      code: 'conflict',
      message: /already being reviewed/,
    })
    expect(repo.removeObjects).toHaveBeenCalledWith([
      input.frontPath,
      input.backPath,
    ])
  })

  it('other database errors are cleaned up and rethrown', async () => {
    asTenant()
    const boom = Object.assign(new Error('boom'), { cause: { code: '53300' } })
    vi.mocked(repo.insertPending).mockRejectedValue(boom)
    await expect(svc.submitVerification(mine())).rejects.toBe(boom)
    expect(repo.removeObjects).toHaveBeenCalled()
  })
})

describe('admin review', () => {
  it('is for superadmins: the role check runs on every admin call', async () => {
    vi.mocked(dal.requireRole).mockRejectedValue(new Error('redirect'))
    await expect(svc.listVerificationsForAdmin('pending')).rejects.toThrow(
      'redirect',
    )
    await expect(svc.getVerificationForAdmin(5)).rejects.toThrow('redirect')
    await expect(
      svc.decideVerification(5, { decision: 'approve' }),
    ).rejects.toThrow('redirect')
    expect(repo.decide).not.toHaveBeenCalled()
  })

  it('lists with the tenant name and ID type', async () => {
    asAdmin()
    vi.mocked(repo.listByStatus).mockResolvedValue([row()] as never)
    vi.mocked(repo.accountNames).mockResolvedValue(
      new Map([[7, { fullName: 'Tess Cruz', email: 't@x.com', phone: null }]]),
    )
    const [item] = await svc.listVerificationsForAdmin('pending')
    expect(item).toMatchObject({
      name: 'Tess Cruz',
      email: 't@x.com',
      idTypeLabel: expect.stringMatching(/National ID/),
      status: 'pending',
    })
  })

  it('detail hands out short-lived links for both pictures', async () => {
    asAdmin()
    vi.mocked(repo.getById).mockResolvedValue(row() as never)
    vi.mocked(repo.accountNames).mockResolvedValue(
      new Map([[7, { fullName: 'Tess', email: 't@x.com', phone: '0917' }]]),
    )
    vi.mocked(repo.signedViewUrl).mockImplementation(
      async (p) => `https://signed/${p}`,
    )
    const d = await svc.getVerificationForAdmin(5)
    expect(d).toMatchObject({
      frontUrl: 'https://signed/identity/7/f',
      backUrl: 'https://signed/identity/7/b',
      phone: '0917',
    })
    await expect(svc.getVerificationForAdmin(5)).resolves.toBeDefined()
    vi.mocked(repo.getById).mockResolvedValue(null)
    await expect(svc.getVerificationForAdmin(9)).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('approve: marks it, gives the tenant the badge, notifies, refreshes their cached profile', async () => {
    asAdmin()
    vi.mocked(repo.getById).mockResolvedValue(row() as never)
    vi.mocked(repo.decide).mockResolvedValue(
      row({ status: 'approved', reviewed_at: '2026-09-26T01:00:00Z' }) as never,
    )
    vi.mocked(users.getAccountById).mockResolvedValue({
      auth_user_id: 'auth-7',
    } as never)
    await svc.decideVerification(5, { decision: 'approve' })
    expect(repo.decide).toHaveBeenCalledWith(5, {
      status: 'approved',
      reviewedBy: 1,
      reason: null,
    })
    expect(repo.setIdVerifiedAt).toHaveBeenCalledWith(7, '2026-09-26T01:00:00Z')
    expect(messaging.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 7,
        notification_type: 'VERIFICATION',
        reference_type: 'verification',
        reference_id: 5,
        title: 'ID verified',
      }),
    )
    expect(dal.invalidateCurrentUser).toHaveBeenCalledWith('auth-7')
  })

  it('reject: needs a reason, gives NO badge, and the tenant is told why', async () => {
    asAdmin()
    vi.mocked(repo.getById).mockResolvedValue(row() as never)
    await expect(
      svc.decideVerification(5, { decision: 'reject' }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(repo.decide).not.toHaveBeenCalled()

    vi.mocked(repo.decide).mockResolvedValue(
      row({ status: 'rejected' }) as never,
    )
    await svc.decideVerification(5, {
      decision: 'reject',
      reason: 'The back photo is blurry.',
    })
    expect(repo.decide).toHaveBeenCalledWith(5, {
      status: 'rejected',
      reviewedBy: 1,
      reason: 'The back photo is blurry.',
    })
    expect(repo.setIdVerifiedAt).not.toHaveBeenCalled()
    expect(messaging.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('The back photo is blurry.'),
      }),
    )
  })

  it('an already-reviewed ID cannot be decided again (also when two admins click at once)', async () => {
    asAdmin()
    vi.mocked(repo.getById).mockResolvedValue(
      row({ status: 'approved' }) as never,
    )
    await expect(
      svc.decideVerification(5, {
        decision: 'reject',
        reason: 'change of mind',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    vi.mocked(repo.getById).mockResolvedValue(row() as never)
    vi.mocked(repo.decide).mockResolvedValue(null)
    await expect(
      svc.decideVerification(5, { decision: 'approve' }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(repo.setIdVerifiedAt).not.toHaveBeenCalled()
    expect(messaging.notify).not.toHaveBeenCalled()
  })

  it('a failed notification does not undo the decision', async () => {
    asAdmin()
    vi.mocked(repo.getById).mockResolvedValue(row() as never)
    vi.mocked(repo.decide).mockResolvedValue(
      row({ status: 'approved', reviewed_at: 'now' }) as never,
    )
    vi.mocked(messaging.notify).mockRejectedValue(new Error('down'))
    vi.mocked(users.getAccountById).mockResolvedValue(null)
    await expect(
      svc.decideVerification(5, { decision: 'approve' }),
    ).resolves.toBeUndefined()
    expect(repo.setIdVerifiedAt).toHaveBeenCalled()
  })
})
