import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/repositories/properties.repository', () => ({
  updateProperty: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/reference.repository', () => ({}))
vi.mock('@/repositories/rooms.repository', () => ({
  updateRoom: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/beds.repository', () => ({}))
vi.mock('@/repositories/rental-rates.repository', () => ({}))
vi.mock('@/services/subscriptions.service', () => ({}))
vi.mock('@/lib/auth/dal', () => ({ requireUser: vi.fn() }))
vi.mock('@/services/property-access', () => ({
  requireManageableProperty: vi.fn().mockResolvedValue({ property: {} }),
  requireManageableRoom: vi.fn().mockResolvedValue({}),
}))

const propsRepo = await import('@/repositories/properties.repository')
const roomsRepo = await import('@/repositories/rooms.repository')
const { updateProperty } = await import('@/services/properties.service')
const { updateRoom } = await import('@/services/rooms.service')

beforeEach(() => vi.clearAllMocks())

// The cover now lives in the photo gallery, which mirrors it into these columns. Saving the
// text form (which no longer has an image field) must not wipe it.
describe('editing a property or room keeps the gallery cover', () => {
  it('property: no image field → property_image is left alone', async () => {
    await updateProperty(1, { property_name: 'Casa', address: '1 Main St' })
    const values = vi.mocked(propsRepo.updateProperty).mock.calls[0][1]
    expect('property_image' in values).toBe(false)
  })

  it('property: an explicit URL is still written (mobile / API callers)', async () => {
    await updateProperty(1, {
      property_name: 'Casa',
      address: '1 Main St',
      property_image: 'https://x.test/a.jpg',
    })
    expect(vi.mocked(propsRepo.updateProperty).mock.calls[0][1]).toMatchObject({
      property_image: 'https://x.test/a.jpg',
    })
  })

  it('room: no image field → room_image is left alone', async () => {
    await updateRoom(1, 2, { max_occupants: '2' })
    const values = vi.mocked(roomsRepo.updateRoom).mock.calls[0][1]
    expect('room_image' in values).toBe(false)
  })

  it('advance/deposit: not mentioned → left alone; stated → written', async () => {
    await updateRoom(1, 2, { max_occupants: '2' })
    const untouched = vi.mocked(roomsRepo.updateRoom).mock.calls[0][1]
    expect('require_advance' in untouched).toBe(false)
    expect('require_deposit' in untouched).toBe(false)

    await updateRoom(1, 2, {
      max_occupants: '2',
      require_advance: '1',
      require_deposit: '0',
    })
    expect(vi.mocked(roomsRepo.updateRoom).mock.calls[1][1]).toMatchObject({
      require_advance: true,
      require_deposit: false,
    })
  })
})
