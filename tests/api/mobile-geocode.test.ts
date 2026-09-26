import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  getCurrentUser: vi.fn(),
  getSessionAuthMethods: vi.fn().mockResolvedValue(['password']),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))
vi.mock('@/services/geocode-request', () => ({ runGeocode: vi.fn() }))

const { getCurrentUser } = await import('@/lib/auth/dal')
const { runGeocode } = await import('@/services/geocode-request')
const route = await import('@/app/api/mobile/geocode/route')

const person = (roles: string[]) => ({
  authUserId: 'u',
  legacyUserId: 100,
  email: 'x@x.com',
  fullName: 'X',
  phone: null,
  address: null,
  avatarUrl: null,
  isActive: true,
  roles,
})
const call = () =>
  route.GET(new Request('http://localhost/api/mobile/geocode?q=bisu'), {
    params: Promise.resolve({}),
  } as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(runGeocode).mockResolvedValue({ places: [] } as never)
})

describe('GET /api/mobile/geocode', () => {
  it.each(['tenant', 'landlord'])(
    'answers a %s (address search for both apps)',
    async (role) => {
      vi.mocked(getCurrentUser).mockResolvedValue(person([role]) as never)
      expect((await call()).status).toBe(200)
      expect(runGeocode).toHaveBeenCalledOnce()
    },
  )

  it('still needs a signed-in tenant or landlord', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as never)
    expect((await call()).status).toBe(401)
    vi.mocked(getCurrentUser).mockResolvedValue(person(['caretaker']) as never)
    expect((await call()).status).toBe(403)
    expect(runGeocode).not.toHaveBeenCalled()
  })
})
