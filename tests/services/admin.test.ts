import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'

vi.mock('@/lib/auth/dal', () => ({ requireRole: vi.fn() }))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
  listPropertyStatuses: vi.fn(),
  listPropertyTypes: vi.fn(),
  listAmenities: vi.fn().mockResolvedValue([]),
  resolveStatusId: vi.fn().mockResolvedValue(1),
}))
vi.mock('@/repositories/properties.repository', () => ({
  getProperty: vi.fn(),
  updateProperty: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/admin.repository', () => ({
  listAllProperties: vi.fn(),
  ownerSummariesByIds: vi.fn().mockResolvedValue(new Map()),
  listAllUsers: vi.fn().mockResolvedValue([]),
  getUserRow: vi.fn(),
  setUserActive: vi.fn().mockResolvedValue(undefined),
  countActiveSuperadmins: vi.fn().mockResolvedValue(2),
}))
vi.mock('@/repositories/discovery.repository', () => ({
  getVisibleProperty: vi.fn().mockResolvedValue(null),
  listRoomsForProperty: vi.fn().mockResolvedValue([]),
  listBedsForRooms: vi.fn().mockResolvedValue([]),
  listActiveRates: vi.fn().mockResolvedValue([]),
  listAmenityLinks: vi.fn().mockResolvedValue([]),
  listRatings: vi.fn().mockResolvedValue([]),
}))

const { requireRole } = await import('@/lib/auth/dal')
const adminRepo = await import('@/repositories/admin.repository')
const propertiesRepo = await import('@/repositories/properties.repository')
const refRepo = await import('@/repositories/reference.repository')
const service = await import('@/services/admin.service')

const asRole = vi.mocked(requireRole)

const superadmin: CurrentUser = {
  authUserId: 'u',
  legacyUserId: 1,
  email: 'a@example.com',
  fullName: 'Admin',
  phone: null,
  address: null,
  avatarUrl: null,
  isActive: true,
  roles: ['superadmin'],
}

const STATUSES = [
  { property_status_id: 1, status_code: 'active', status_name: 'Active' },
  { property_status_id: 3, status_code: 'pending', status_name: 'Pending' },
]

const PROPS = [
  {
    property_id: 10,
    property_name: 'A',
    address: 'x',
    status_id: 3,
    property_owner: 50,
    property_type_id: null,
    is_verified: false,
    is_featured: false,
    created_at: '2026-01-01',
  },
  {
    property_id: 11,
    property_name: 'B',
    address: 'y',
    status_id: 1,
    property_owner: 50,
    property_type_id: null,
    is_verified: true,
    is_featured: false,
    created_at: '2026-02-01',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  asRole.mockResolvedValue(superadmin)
  vi.mocked(refRepo.listPropertyStatuses).mockResolvedValue(STATUSES as never)
  vi.mocked(refRepo.listPropertyTypes).mockResolvedValue([] as never)
  vi.mocked(adminRepo.listAllProperties).mockResolvedValue(PROPS as never)
})

describe('listAdminProperties', () => {
  it('requires the superadmin role', async () => {
    await service.listAdminProperties()
    expect(asRole).toHaveBeenCalledWith('superadmin')
  })

  it('returns every property when unfiltered', async () => {
    const items = await service.listAdminProperties()
    expect(items.map((p) => p.propertyId)).toEqual([10, 11])
  })

  it('filters by status code', async () => {
    const items = await service.listAdminProperties('pending')
    expect(items).toHaveLength(1)
    expect(items[0].propertyId).toBe(10)
    expect(items[0].statusCode).toBe('pending')
  })
})

describe('getListingOverview', () => {
  it('counts properties per status', async () => {
    const o = await service.getListingOverview()
    expect(o.total).toBe(2)
    expect(o.pending).toBe(1)
    expect(o.byStatus.find((s) => s.code === 'active')?.count).toBe(1)
  })
})

describe('getAdminProperty', () => {
  it('404s an unknown property', async () => {
    await expect(service.getAdminProperty(999)).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('loads a property regardless of its status', async () => {
    const detail = await service.getAdminProperty(10)
    expect(detail.property.property_id).toBe(10)
    expect(detail.statusCode).toBe('pending')
  })
})

describe('setPropertyStatus', () => {
  it('requires superadmin and 404s an unknown property', async () => {
    vi.mocked(propertiesRepo.getProperty).mockResolvedValue(null)
    await expect(
      service.setPropertyStatus(10, { status_code: 'active' }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(asRole).toHaveBeenCalledWith('superadmin')
  })

  it('rejects an invalid status', async () => {
    vi.mocked(propertiesRepo.getProperty).mockResolvedValue({} as never)
    await expect(
      service.setPropertyStatus(10, { status_code: 'sold' }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('updates the status of a real property', async () => {
    vi.mocked(propertiesRepo.getProperty).mockResolvedValue({
      property_id: 10,
    } as never)
    await service.setPropertyStatus(10, { status_code: 'active' })
    expect(propertiesRepo.updateProperty).toHaveBeenCalledWith(10, {
      status_id: 1,
    })
  })
})

describe('setUserActive', () => {
  it('blocks deactivating yourself', async () => {
    await expect(
      service.setUserActive(1, { is_active: 'false' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('blocks deactivating the last active superadmin', async () => {
    vi.mocked(adminRepo.getUserRow).mockResolvedValue({
      legacy_user_id: 2,
      roles: ['superadmin'],
    } as never)
    vi.mocked(adminRepo.countActiveSuperadmins).mockResolvedValue(1)
    await expect(
      service.setUserActive(2, { is_active: 'false' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('deactivates a normal user', async () => {
    vi.mocked(adminRepo.getUserRow).mockResolvedValue({
      legacy_user_id: 3,
      roles: ['tenant'],
    } as never)
    await service.setUserActive(3, { is_active: 'false' })
    expect(adminRepo.setUserActive).toHaveBeenCalledWith(3, false)
  })
})
