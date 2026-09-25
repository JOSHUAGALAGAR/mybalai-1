import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi.fn(),
  invalidateCurrentUser: vi.fn(),
}))
vi.mock('@/repositories/profile-photo.repository', () => ({
  createSignedUpload: vi.fn(),
  objectExists: vi.fn(),
  publicUrl: vi.fn(
    (p: string) => `https://cdn/storage/v1/object/public/profile-images/${p}`,
  ),
  pathFromPublicUrl: vi.fn(),
  removeObjects: vi.fn(),
  currentAvatarUrl: vi.fn(),
  setAvatarUrl: vi.fn(),
}))

const dal = await import('@/lib/auth/dal')
const repo = await import('@/repositories/profile-photo.repository')
const svc = await import('@/services/profile-photo.service')
const { newAvatarPath } = await import('@/lib/identity/rules')

const jpg = { name: 'me.jpg', type: 'image/jpeg', size: 100_000 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(dal.requireUser).mockResolvedValue({
    legacyUserId: 9,
    authUserId: 'auth-9',
    roles: ['landlord'],
  } as never)
  vi.mocked(repo.createSignedUpload).mockImplementation(async (path) => ({
    path,
    token: 't',
  }))
  vi.mocked(repo.objectExists).mockResolvedValue(true)
  vi.mocked(repo.currentAvatarUrl).mockResolvedValue(null)
  vi.mocked(repo.pathFromPublicUrl).mockReturnValue(null)
  vi.mocked(repo.removeObjects).mockResolvedValue(undefined)
})

describe('profile photo', () => {
  it('any signed-in role gets an upload link named for them', async () => {
    const r = await svc.prepareAvatarUpload(jpg)
    expect(r.path).toMatch(/^avatars\/9\/.+\.jpg$/)
  })

  it('refuses a wrong type, an empty file and one over 3 MB', async () => {
    await expect(
      svc.prepareAvatarUpload({ ...jpg, type: 'image/gif' }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      svc.prepareAvatarUpload({ ...jpg, size: 0 }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      svc.prepareAvatarUpload({ ...jpg, size: 4 * 1024 * 1024 }),
    ).rejects.toMatchObject({ message: /3 MB/ })
  })

  it("won't register a file that is not this user's or never arrived", async () => {
    await expect(
      svc.registerAvatar({ path: newAvatarPath(10, 'image/jpeg')! }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      svc.registerAvatar({ path: 'avatars/9/../10/x.jpg' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    vi.mocked(repo.objectExists).mockResolvedValue(false)
    await expect(
      svc.registerAvatar({ path: newAvatarPath(9, 'image/jpeg')! }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(repo.setAvatarUrl).not.toHaveBeenCalled()
  })

  it('registers the photo, deletes the previous one of ours, and refreshes the cached profile', async () => {
    const path = newAvatarPath(9, 'image/png')!
    vi.mocked(repo.currentAvatarUrl).mockResolvedValue('https://cdn/old')
    vi.mocked(repo.pathFromPublicUrl).mockReturnValue('avatars/9/old.jpg')
    const r = await svc.registerAvatar({ path })
    expect(r.avatarUrl).toContain(path)
    expect(repo.setAvatarUrl).toHaveBeenCalledWith(9, r.avatarUrl)
    expect(repo.removeObjects).toHaveBeenCalledWith(['avatars/9/old.jpg'])
    expect(dal.invalidateCurrentUser).toHaveBeenCalledWith('auth-9')
  })

  it("leaves a non-ours previous picture (e.g. Google's) alone", async () => {
    vi.mocked(repo.currentAvatarUrl).mockResolvedValue(
      'https://lh3.googleusercontent.com/x',
    )
    vi.mocked(repo.pathFromPublicUrl).mockReturnValue(null)
    await svc.registerAvatar({ path: newAvatarPath(9, 'image/jpeg')! })
    expect(repo.removeObjects).not.toHaveBeenCalled()
  })

  it('remove clears the photo and deletes the file', async () => {
    vi.mocked(repo.currentAvatarUrl).mockResolvedValue('https://cdn/x')
    vi.mocked(repo.pathFromPublicUrl).mockReturnValue('avatars/9/x.jpg')
    await svc.removeAvatar()
    expect(repo.setAvatarUrl).toHaveBeenCalledWith(9, null)
    expect(repo.removeObjects).toHaveBeenCalledWith(['avatars/9/x.jpg'])
    expect(dal.invalidateCurrentUser).toHaveBeenCalledWith('auth-9')
  })
})
