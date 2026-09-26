import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserById, updateUserById } = vi.hoisted(() => ({
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
}))

vi.mock('@/lib/auth/dal', () => ({
  requireRole: vi.fn(),
  invalidateCurrentUser: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById, updateUserById } },
  }),
}))
vi.mock('@/services/audit.service', () => ({ recordAudit: vi.fn() }))
vi.mock('@/repositories/admin.repository', () => ({ getUserRow: vi.fn() }))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))
vi.mock('@/repositories/boosts.repository', () => ({}))
vi.mock('@/repositories/users.repository', () => ({}))
vi.mock('@/repositories/discovery.repository', () => ({}))
vi.mock('@/repositories/properties.repository', () => ({}))

const dal = await import('@/lib/auth/dal')
const audit = await import('@/services/audit.service')
const adminRepo = await import('@/repositories/admin.repository')
const service = await import('@/services/admin.service')

const admin = { legacyUserId: 1, roles: ['superadmin'] }
const row = (over: Record<string, unknown> = {}) => ({
  legacy_user_id: 9,
  full_name: 'Tess Cruz',
  email: 'tess@example.com',
  auth_user_id: 'auth-9',
  roles: ['tenant'],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(dal.requireRole).mockResolvedValue(admin as never)
  vi.mocked(adminRepo.getUserRow).mockResolvedValue(row() as never)
  getUserById.mockResolvedValue({
    data: { user: { app_metadata: { providers: ['email'] } } },
    error: null,
  })
  updateUserById.mockResolvedValue({ error: null })
})

describe('resetUserPassword', () => {
  it('sets a new password, forgets the cached user, and audits it without the password', async () => {
    const r = await service.resetUserPassword(9)
    expect(r).toMatchObject({ email: 'tess@example.com', name: 'Tess Cruz' })
    expect(r.password).toMatch(/^[A-Za-z0-9]{12}$/)
    expect(updateUserById).toHaveBeenCalledWith('auth-9', {
      password: r.password,
    })
    expect(dal.invalidateCurrentUser).toHaveBeenCalledWith('auth-9')
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.password_reset', targetId: 9 }),
    )
    expect(
      JSON.stringify(vi.mocked(audit.recordAudit).mock.calls),
    ).not.toContain(r.password)
  })

  it('is for superadmins only', async () => {
    vi.mocked(dal.requireRole).mockRejectedValue(new Error('forbidden'))
    await expect(service.resetUserPassword(9)).rejects.toThrow('forbidden')
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses your own account and other admins', async () => {
    await expect(service.resetUserPassword(1)).rejects.toMatchObject({
      code: 'conflict',
    })
    vi.mocked(adminRepo.getUserRow).mockResolvedValue(
      row({ roles: ['superadmin'] }) as never,
    )
    await expect(service.resetUserPassword(9)).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses a Google-only account (no password to reset)', async () => {
    getUserById.mockResolvedValue({
      data: { user: { app_metadata: { providers: ['google'] } } },
      error: null,
    })
    await expect(service.resetUserPassword(9)).rejects.toThrow(/Google/)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('handles a missing user, a missing sign-in, and a failed update', async () => {
    vi.mocked(adminRepo.getUserRow).mockResolvedValue(null)
    await expect(service.resetUserPassword(9)).rejects.toMatchObject({
      code: 'not_found',
    })
    vi.mocked(adminRepo.getUserRow).mockResolvedValue(
      row({ auth_user_id: null }) as never,
    )
    await expect(service.resetUserPassword(9)).rejects.toMatchObject({
      code: 'conflict',
    })
    vi.mocked(adminRepo.getUserRow).mockResolvedValue(row() as never)
    updateUserById.mockResolvedValue({ error: { message: 'boom' } })
    await expect(service.resetUserPassword(9)).rejects.toThrow(/Could not set/)
    expect(audit.recordAudit).not.toHaveBeenCalled()
  })
})
