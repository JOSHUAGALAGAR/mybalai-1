import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'

vi.mock('@/lib/auth/dal', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/repositories/subscriptions.repository', () => ({
  getSubscriptionForLandlord: vi.fn(),
  getPlan: vi.fn(),
  listPlans: vi.fn().mockResolvedValue([]),
  listSubscriptions: vi.fn().mockResolvedValue([]),
  insertPlan: vi.fn(),
  updatePlan: vi.fn(),
  upsertSubscription: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/properties.repository', () => ({
  listProperties: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/rooms.repository', () => ({
  listRoomsByProperty: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/beds.repository', () => ({
  listBedsByRoom: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/caretakers.repository', () => ({
  listCaretakerIdsForLandlord: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/repositories/users.repository', () => ({
  getAccountById: vi.fn(),
  getAccountByEmail: vi.fn(),
  getRoleCodes: vi.fn(),
}))
vi.mock('@/repositories/admin.repository', () => ({
  listLandlordAccounts: vi.fn().mockResolvedValue([]),
  ensureLandlordProvisioned: vi.fn(),
}))

const { requireRole } = await import('@/lib/auth/dal')
const subsRepo = await import('@/repositories/subscriptions.repository')
const propertiesRepo = await import('@/repositories/properties.repository')
const usersRepo = await import('@/repositories/users.repository')
const service = await import('@/services/subscriptions.service')

const asRole = vi.mocked(requireRole)
const superadmin: CurrentUser = {
  authUserId: 'u',
  legacyUserId: 1,
  email: 'a@x.com',
  fullName: 'A',
  phone: null,
  address: null,
  avatarUrl: null,
  isActive: true,
  roles: ['superadmin'],
}

const FREE = {
  plan_id: 1,
  code: 'free',
  name: 'Free',
  max_properties: 3,
  max_rooms_per_property: 3,
  max_beds_per_room: 4,
  max_caretakers: 1,
  is_active: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  asRole.mockResolvedValue(superadmin)
  vi.mocked(subsRepo.getPlan).mockResolvedValue(FREE as never)
  vi.mocked(subsRepo.getSubscriptionForLandlord).mockResolvedValue({
    subscription_id: 9,
    landlord_id: 50,
    plan_id: 1,
    status: 'active',
    ends_at: null,
  } as never)
})

describe('getEffectiveLimits', () => {
  it('is null with no subscription', async () => {
    vi.mocked(subsRepo.getSubscriptionForLandlord).mockResolvedValue(null)
    expect(await service.getEffectiveLimits(50)).toBeNull()
  })

  it('is null when suspended', async () => {
    vi.mocked(subsRepo.getSubscriptionForLandlord).mockResolvedValue({
      landlord_id: 50,
      plan_id: 1,
      status: 'suspended',
      ends_at: null,
    } as never)
    expect(await service.getEffectiveLimits(50)).toBeNull()
  })

  it('is null when past ends_at', async () => {
    vi.mocked(subsRepo.getSubscriptionForLandlord).mockResolvedValue({
      landlord_id: 50,
      plan_id: 1,
      status: 'active',
      ends_at: '2000-01-01',
    } as never)
    expect(await service.getEffectiveLimits(50)).toBeNull()
  })

  it('returns the plan caps when active and open-ended', async () => {
    const limits = await service.getEffectiveLimits(50)
    expect(limits?.maxProperties).toBe(3)
  })
})

describe('assertCanAddProperty', () => {
  it('blocks with no active subscription', async () => {
    vi.mocked(subsRepo.getSubscriptionForLandlord).mockResolvedValue(null)
    await expect(service.assertCanAddProperty(50)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('blocks at the cap', async () => {
    vi.mocked(propertiesRepo.listProperties).mockResolvedValue([
      {},
      {},
      {},
    ] as never)
    await expect(service.assertCanAddProperty(50)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('allows under the cap', async () => {
    vi.mocked(propertiesRepo.listProperties).mockResolvedValue([{}] as never)
    await expect(service.assertCanAddProperty(50)).resolves.toBeUndefined()
  })
})

describe('assignSubscription', () => {
  it('rejects a non-landlord target', async () => {
    vi.mocked(usersRepo.getAccountById).mockResolvedValue({
      legacy_user_id: 50,
    } as never)
    vi.mocked(usersRepo.getRoleCodes).mockResolvedValue(['tenant'])
    await expect(
      service.assignSubscription({
        landlord_id: '50',
        plan_id: '1',
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('upserts for a valid landlord', async () => {
    vi.mocked(usersRepo.getAccountById).mockResolvedValue({
      legacy_user_id: 50,
    } as never)
    vi.mocked(usersRepo.getRoleCodes).mockResolvedValue(['landlord'])
    await service.assignSubscription({
      landlord_id: '50',
      plan_id: '1',
      status: 'active',
    })
    expect(subsRepo.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        landlord_id: 50,
        plan_id: 1,
        status: 'active',
      }),
    )
  })
})

describe('createPlan', () => {
  it('requires the superadmin role', async () => {
    await service
      .createPlan({
        code: 'x',
        name: 'X',
        max_properties: '1',
        max_rooms_per_property: '1',
        max_beds_per_room: '1',
        max_caretakers: '1',
        is_active: 'on',
      })
      .catch(() => undefined)
    expect(asRole).toHaveBeenCalledWith('superadmin')
  })
})
