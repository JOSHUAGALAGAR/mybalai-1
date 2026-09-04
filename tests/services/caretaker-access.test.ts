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
vi.mock('@/repositories/caretakers.repository', () => ({
  isPropertyAssigned: vi.fn(),
}))

const { requireUser } = await import('@/lib/auth/dal')
const propsRepo = await import('@/repositories/properties.repository')
const caretakersRepo = await import('@/repositories/caretakers.repository')
const access = await import('@/services/property-access')

const asUser = vi.mocked(requireUser)

function user(roles: AppRole[], legacyUserId = 700): CurrentUser {
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(propsRepo.getProperty).mockResolvedValue({
    property_id: 10,
    property_owner: 999,
  } as never)
})

describe('requireOperableProperty', () => {
  it('allows the owning landlord', async () => {
    asUser.mockResolvedValue(user(['landlord'], 999))
    await expect(access.requireOperableProperty(10)).resolves.toBeTruthy()
    expect(caretakersRepo.isPropertyAssigned).not.toHaveBeenCalled()
  })

  it('allows a superadmin', async () => {
    asUser.mockResolvedValue(user(['superadmin'], 1))
    await expect(access.requireOperableProperty(10)).resolves.toBeTruthy()
  })

  it('allows a caretaker with an active assignment', async () => {
    asUser.mockResolvedValue(user(['caretaker'], 700))
    vi.mocked(caretakersRepo.isPropertyAssigned).mockResolvedValue(true)
    await expect(access.requireOperableProperty(10)).resolves.toBeTruthy()
    expect(caretakersRepo.isPropertyAssigned).toHaveBeenCalledWith(700, 10)
  })

  it('hides the property from an unassigned caretaker', async () => {
    asUser.mockResolvedValue(user(['caretaker'], 700))
    vi.mocked(caretakersRepo.isPropertyAssigned).mockResolvedValue(false)
    await expect(access.requireOperableProperty(10)).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('hides the property from a tenant', async () => {
    asUser.mockResolvedValue(user(['tenant'], 700))
    await expect(access.requireOperableProperty(10)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
