import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi
    .fn()
    .mockResolvedValue({ legacyUserId: 5, roles: ['landlord'] }),
}))
vi.mock('@/repositories/properties.repository', () => ({
  insertProperty: vi.fn(),
  updateProperty: vi.fn(),
}))
vi.mock('@/repositories/rooms.repository', () => ({
  insertRoom: vi.fn(),
  updateRoom: vi.fn(),
}))
vi.mock('@/repositories/reference.repository', () => ({
  resolveStatusId: vi.fn().mockResolvedValue(1),
}))
vi.mock('@/repositories/beds.repository', () => ({}))
vi.mock('@/repositories/rental-rates.repository', () => ({}))
vi.mock('@/services/subscriptions.service', () => ({
  assertCanAddProperty: vi.fn(),
  assertCanAddRoom: vi.fn(),
}))
vi.mock('@/services/property-access', () => ({
  requireManageableProperty: vi.fn().mockResolvedValue({
    user: { roles: ['landlord'] },
    property: { property_owner: 5 },
  }),
  requireManageableRoom: vi.fn().mockResolvedValue({}),
}))

const propsRepo = await import('@/repositories/properties.repository')
const roomsRepo = await import('@/repositories/rooms.repository')
const { createProperty, updateProperty } =
  await import('@/services/properties.service')
const { createRoom } = await import('@/services/rooms.service')

const property = { property_name: 'Casa', address: '1 Main Street' }
const missingColumn = Object.assign(new Error('Failed to save.'), {
  cause: {
    code: '42703',
    message: 'column properties.require_advance does not exist',
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(propsRepo.insertProperty).mockResolvedValue({
    property_id: 9,
  } as never)
  vi.mocked(propsRepo.updateProperty).mockResolvedValue({} as never)
  vi.mocked(roomsRepo.insertRoom).mockResolvedValue({ room_id: 3 } as never)
})

describe('creating with the switches OFF works even before migration 0014', () => {
  it('property: an unchecked form writes neither column', async () => {
    await createProperty({
      ...property,
      require_advance: '0',
      require_deposit: '0',
    })
    const row = vi.mocked(propsRepo.insertProperty).mock.calls[0][0]
    expect('require_advance' in row).toBe(false)
    expect('require_deposit' in row).toBe(false)
  })

  it('property: only the switches that are ON are written', async () => {
    await createProperty({
      ...property,
      require_advance: '1',
      require_deposit: '0',
    })
    const row = vi.mocked(propsRepo.insertProperty).mock.calls[0][0]
    expect(row.require_advance).toBe(true)
    expect('require_deposit' in row).toBe(false)
  })

  it('room: same rule', async () => {
    await createRoom(1, {
      max_occupants: '2',
      require_advance: '0',
      require_deposit: '0',
    })
    const off = vi.mocked(roomsRepo.insertRoom).mock.calls[0][0]
    expect('require_advance' in off).toBe(false)
    await createRoom(1, {
      max_occupants: '2',
      require_advance: '1',
      require_deposit: '1',
    })
    expect(vi.mocked(roomsRepo.insertRoom).mock.calls[1][0]).toMatchObject({
      require_advance: true,
      require_deposit: true,
    })
  })
})

describe('a missing advance/deposit column is explained', () => {
  it('create: tells the landlord which migration to run', async () => {
    vi.mocked(propsRepo.insertProperty).mockRejectedValue(missingColumn)
    await expect(
      createProperty({ ...property, require_advance: '1' }),
    ).rejects.toThrow(/migration 0014/)
  })

  it('update: same message', async () => {
    vi.mocked(propsRepo.updateProperty).mockRejectedValue(missingColumn)
    await expect(updateProperty(1, property)).rejects.toThrow(/migration 0014/)
  })

  it('other database errors are left alone', async () => {
    const other = Object.assign(new Error('boom'), {
      cause: { code: '23505', message: 'duplicate' },
    })
    vi.mocked(propsRepo.insertProperty).mockRejectedValue(other)
    await expect(createProperty(property)).rejects.toBe(other)
  })
})

describe('an old contact number that is not valid does not block other edits', () => {
  const stored = '091231823478432'
  beforeEach(async () => {
    const access = await import('@/services/property-access')
    vi.mocked(access.requireManageableProperty).mockResolvedValue({
      user: { roles: ['landlord'] },
      property: { property_owner: 5, contact_number: stored },
    } as never)
  })

  it('unchanged: saved as it was (the rest of the edit goes through)', async () => {
    await updateProperty(1, { ...property, contact_number: stored })
    expect(vi.mocked(propsRepo.updateProperty).mock.calls[0][1]).toMatchObject({
      contact_number: stored,
    })
  })

  it('changed to another bad number: refused', async () => {
    await expect(
      updateProperty(1, { ...property, contact_number: '12345' }),
    ).rejects.toMatchObject({
      fieldErrors: {
        contact_number: [expect.stringMatching(/valid Philippine number/)],
      },
    })
  })

  it('changed to a good number: saved in the clean form', async () => {
    await updateProperty(1, { ...property, contact_number: '09171234567' })
    expect(vi.mocked(propsRepo.updateProperty).mock.calls[0][1]).toMatchObject({
      contact_number: '+63 917 123 4567',
    })
  })

  it('cleared: saved as empty', async () => {
    await updateProperty(1, { ...property, contact_number: '' })
    expect(vi.mocked(propsRepo.updateProperty).mock.calls[0][1]).toMatchObject({
      contact_number: null,
    })
  })
})
