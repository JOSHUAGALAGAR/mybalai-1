import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'
import type { AppRole } from '@/lib/auth/roles'

vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/repositories/properties.repository', () => ({
  getProperty: vi.fn(),
}))
vi.mock('@/repositories/rooms.repository', () => ({ getRoom: vi.fn() }))
vi.mock('@/repositories/beds.repository', () => ({ getBed: vi.fn() }))
vi.mock('@/repositories/rental-rates.repository', () => ({ getRate: vi.fn() }))

const { requireUser } = await import('@/lib/auth/dal')
const propsRepo = await import('@/repositories/properties.repository')
const roomsRepo = await import('@/repositories/rooms.repository')
const access = await import('@/services/property-access')

const asUser = vi.mocked(requireUser)

function user(roles: AppRole[], legacyUserId = 500): CurrentUser {
  return {
    authUserId: 'uuid',
    legacyUserId,
    email: 'u@example.com',
    fullName: 'U',
    phone: null,
    address: null,
    avatarUrl: null,
    isActive: true,
    roles,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('requireManageableProperty', () => {
  it('404s when the property does not exist', async () => {
    asUser.mockResolvedValue(user(['landlord']))
    vi.mocked(propsRepo.getProperty).mockResolvedValue(null)
    await expect(access.requireManageableProperty(1)).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('forbids a landlord who is not the owner', async () => {
    asUser.mockResolvedValue(user(['landlord'], 500))
    vi.mocked(propsRepo.getProperty).mockResolvedValue({
      property_id: 1,
      property_owner: 999,
    } as never)
    await expect(access.requireManageableProperty(1)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('allows the owning landlord', async () => {
    asUser.mockResolvedValue(user(['landlord'], 500))
    vi.mocked(propsRepo.getProperty).mockResolvedValue({
      property_id: 1,
      property_owner: 500,
    } as never)
    const ctx = await access.requireManageableProperty(1)
    expect(ctx.property.property_id).toBe(1)
  })

  it('allows a superadmin regardless of owner', async () => {
    asUser.mockResolvedValue(user(['superadmin'], 1))
    vi.mocked(propsRepo.getProperty).mockResolvedValue({
      property_id: 1,
      property_owner: 999,
    } as never)
    await expect(access.requireManageableProperty(1)).resolves.toBeTruthy()
  })
})

describe('requireManageableRoom', () => {
  it('404s when the room belongs to a different property', async () => {
    asUser.mockResolvedValue(user(['landlord'], 500))
    vi.mocked(propsRepo.getProperty).mockResolvedValue({
      property_id: 1,
      property_owner: 500,
    } as never)
    vi.mocked(roomsRepo.getRoom).mockResolvedValue({
      room_id: 9,
      property_id: 2,
    } as never)
    await expect(access.requireManageableRoom(1, 9)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
