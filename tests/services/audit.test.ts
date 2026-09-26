import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'

vi.mock('@/lib/auth/dal', () => ({ requireRole: vi.fn() }))
vi.mock('@/repositories/audit.repository', () => ({
  insertAudit: vi.fn(),
  listAudit: vi.fn(),
  listRecentAudit: vi.fn(),
}))

const { requireRole } = await import('@/lib/auth/dal')
const repo = await import('@/repositories/audit.repository')
const service = await import('@/services/audit.service')

const admin: CurrentUser = {
  authUserId: 'u',
  legacyUserId: 1,
  email: 'admin@example.com',
  fullName: 'Ada Admin',
  phone: null,
  address: null,
  avatarUrl: null,
  isActive: true,
  roles: ['superadmin'],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireRole).mockResolvedValue(admin)
})

describe('recordAudit', () => {
  it('stores who, what and to what, with a name snapshot', async () => {
    await service.recordAudit({
      actor: admin,
      action: 'user.deactivated',
      targetType: 'user',
      targetId: 42,
      summary: 'Deactivated Juan',
    })
    expect(repo.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 1,
        actorName: 'Ada Admin',
        action: 'user.deactivated',
        targetType: 'user',
        targetId: '42',
        summary: 'Deactivated Juan',
      }),
    )
  })

  it('falls back to the email, and records a null actor for self-service events', async () => {
    await service.recordAudit({
      actor: { ...admin, fullName: null },
      action: 'ad.created',
      summary: 'x',
    })
    expect(vi.mocked(repo.insertAudit).mock.calls[0][0].actorName).toBe(
      'admin@example.com',
    )

    await service.recordAudit({
      actor: null,
      action: 'account.deleted',
      summary: 'y',
    })
    expect(vi.mocked(repo.insertAudit).mock.calls[1][0].actorId).toBeNull()
  })

  it('keeps only small scalar details (never objects, arrays or long text)', async () => {
    await service.recordAudit({
      actor: admin,
      action: 'ad.updated',
      summary: 'x',
      details: {
        price: 99,
        ok: true,
        note: 'n'.repeat(1000),
        nested: { a: 1 },
        list: [1],
        none: null,
      },
    })
    const details = vi.mocked(repo.insertAudit).mock.calls[0][0]
      .details as Record<string, unknown>
    expect(details).toMatchObject({ price: 99, ok: true, none: null })
    expect((details.note as string).length).toBe(300)
    expect(details).not.toHaveProperty('nested')
    expect(details).not.toHaveProperty('list')
  })

  it('never throws, so a logging failure cannot block the action itself', async () => {
    vi.mocked(repo.insertAudit).mockRejectedValue(
      new Error('relation "audit_logs" does not exist'),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      service.recordAudit({ actor: admin, action: 'ad.created', summary: 'x' }),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('listAuditLog', () => {
  it('is superadmin-only and pages by 25', async () => {
    vi.mocked(repo.listAudit).mockResolvedValue({ rows: [], total: 51 })
    const result = await service.listAuditLog({ page: 2, group: 'user.' })
    expect(requireRole).toHaveBeenCalledWith('superadmin')
    expect(repo.listAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionPrefix: 'user.' }),
      2,
      25,
    )
    expect(result.pageCount).toBe(3)
  })

  it('treats a bad page number as page 1', async () => {
    vi.mocked(repo.listAudit).mockResolvedValue({ rows: [], total: 0 })
    await service.listAuditLog({ page: -4 })
    expect(vi.mocked(repo.listAudit).mock.calls[0][1]).toBe(1)
  })
})

describe('recentActivity', () => {
  it('returns nothing (instead of failing the overview) when the log is unavailable', async () => {
    vi.mocked(repo.listRecentAudit).mockRejectedValue(
      new Error('missing table'),
    )
    await expect(service.recentActivity()).resolves.toEqual([])
  })
})
