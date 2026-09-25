import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/property-access', () => ({
  requireManageableProperty: vi.fn().mockResolvedValue({}),
  requireManageableRoom: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))
vi.mock('@/repositories/property-images.repository', () => ({
  ownerIdOf: (t: { kind: string; propertyId: number; roomId?: number }) =>
    t.kind === 'property' ? t.propertyId : t.roomId,
  listImages: vi.fn(),
  getImage: vi.fn(),
  nextSortOrder: vi.fn().mockResolvedValue(0),
  insertImages: vi.fn().mockResolvedValue(undefined),
  clearCover: vi.fn().mockResolvedValue(undefined),
  markCover: vi.fn().mockResolvedValue(undefined),
  deleteImageRow: vi.fn().mockResolvedValue(undefined),
  syncOwnerCover: vi.fn().mockResolvedValue(undefined),
  createSignedUpload: vi.fn(async (path: string) => ({
    path,
    token: `tok-${path}`,
  })),
  objectExists: vi.fn().mockResolvedValue(true),
  removeObjects: vi.fn().mockResolvedValue(undefined),
  listUrlsByOwners: vi.fn(),
}))

const access = await import('@/services/property-access')
const repo = await import('@/repositories/property-images.repository')
const svc = await import('@/services/property-images.service')

const property = { kind: 'property', propertyId: 12 } as const
const room = { kind: 'room', propertyId: 12, roomId: 34 } as const
const UUID = (n: number) => `123e4567-e89b-12d3-a456-42661417400${n}`
const path = (
  n: number,
  kind: 'properties/12' | 'rooms/34' = 'properties/12',
  ext = 'jpg',
) => `${kind}/${UUID(n)}.${ext}`
const row = (n: number, over: Partial<Record<string, unknown>> = {}) =>
  ({
    imageId: n,
    ownerId: 12,
    storagePath: path(n),
    originalFilename: `p${n}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1000,
    isCover: false,
    sortOrder: n,
    createdAt: 'x',
    url: `https://cdn/${path(n)}`,
    ...over,
  }) as never
const file = (n: number, over = {}) => ({
  path: path(n),
  name: `p${n}.jpg`,
  type: 'image/jpeg',
  size: 1000,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.listImages).mockResolvedValue([])
  vi.mocked(repo.objectExists).mockResolvedValue(true)
  vi.mocked(repo.nextSortOrder).mockResolvedValue(0)
})

describe('authorisation', () => {
  it('every operation is gated on managing the property (rooms: managing the room)', async () => {
    await svc.listGallery(property)
    expect(access.requireManageableProperty).toHaveBeenCalledWith(12)
    await svc.listGallery(room)
    expect(access.requireManageableRoom).toHaveBeenCalledWith(12, 34)
  })

  it('refuses everything — issuing links, registering, cover, delete — when the caller does not manage it', async () => {
    const { ServiceError } = await import('@/services/errors')
    vi.mocked(access.requireManageableProperty).mockRejectedValue(
      new ServiceError('no', 'forbidden'),
    )
    await expect(
      svc.prepareUploads(property, [
        { name: 'a.jpg', type: 'image/jpeg', size: 10 },
      ]),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      svc.registerUploads(property, [file(1)]),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(svc.setCoverImage(property, 1)).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(svc.removeImage(property, 1)).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(repo.createSignedUpload).not.toHaveBeenCalled()
    expect(repo.insertImages).not.toHaveBeenCalled()
    expect(repo.deleteImageRow).not.toHaveBeenCalled()
    vi.mocked(access.requireManageableProperty).mockResolvedValue({} as never)
  })
})

describe('prepareUploads', () => {
  it('issues one link per file, in the target folder, named by us (never by the user)', async () => {
    const { uploads } = await svc.prepareUploads(property, [
      { name: '../../etc/passwd.jpg', type: 'image/jpeg', size: 500 },
      { name: 'b.png', type: 'image/png', size: 500 },
    ])
    expect(uploads).toHaveLength(2)
    expect(uploads[0].path).toMatch(/^properties\/12\/[0-9a-f-]{36}\.jpg$/)
    expect(uploads[1].path).toMatch(/\.png$/)
    expect(uploads[0].path).not.toContain('passwd')
    expect(uploads.map((u) => u.index)).toEqual([0, 1])
  })

  it('uses the room folder for a room', async () => {
    const { uploads } = await svc.prepareUploads(room, [
      { name: 'a.webp', type: 'image/webp', size: 5 },
    ])
    expect(uploads[0].path).toMatch(/^rooms\/34\//)
  })

  it.each([
    ['a GIF', { name: 'a.gif', type: 'image/gif', size: 10 }],
    ['an SVG', { name: 'a.svg', type: 'image/svg+xml', size: 10 }],
    [
      'a file over 5 MB',
      { name: 'a.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 },
    ],
  ])('rejects %s before issuing anything', async (_l, f) => {
    await expect(svc.prepareUploads(property, [f])).rejects.toMatchObject({
      code: 'validation',
    })
    expect(repo.createSignedUpload).not.toHaveBeenCalled()
  })

  it('counts existing photos against the limit', async () => {
    vi.mocked(repo.listImages).mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => row(i + 1)),
    )
    const two = [
      { name: 'a.jpg', type: 'image/jpeg', size: 1 },
      { name: 'b.jpg', type: 'image/jpeg', size: 1 },
    ]
    await expect(svc.prepareUploads(property, two)).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringMatching(/1 more photo/),
    })
  })
})

describe('registerUploads', () => {
  it('saves the files; with no cover yet, the first becomes the cover and is mirrored to the property', async () => {
    vi.mocked(repo.listImages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row(1, { isCover: true }), row(2)])
    await svc.registerUploads(property, [file(1), file(2)])
    const inserted = vi.mocked(repo.insertImages).mock.calls[0][1]
    expect(
      inserted.map((i) => [i.storagePath, i.isCover, i.sortOrder]),
    ).toEqual([
      [path(1), true, 0],
      [path(2), false, 1],
    ])
    expect(repo.syncOwnerCover).toHaveBeenCalledWith(
      property,
      `https://cdn/${path(1)}`,
    )
    expect(repo.clearCover).not.toHaveBeenCalled()
  })

  it('an explicit cover among the new files wins, replacing an existing cover', async () => {
    vi.mocked(repo.listImages)
      .mockResolvedValueOnce([row(9, { isCover: true })])
      .mockResolvedValueOnce([])
    await svc.registerUploads(property, [file(1), file(2)], path(2))
    expect(repo.clearCover).toHaveBeenCalledOnce()
    expect(
      vi.mocked(repo.insertImages).mock.calls[0][1].map((i) => i.isCover),
    ).toEqual([false, true])
  })

  it('keeps the existing cover when new photos are added without choosing one', async () => {
    vi.mocked(repo.listImages)
      .mockResolvedValueOnce([row(9, { isCover: true })])
      .mockResolvedValueOnce([])
    await svc.registerUploads(property, [file(1)])
    expect(repo.clearCover).not.toHaveBeenCalled()
    expect(vi.mocked(repo.insertImages).mock.calls[0][1][0].isCover).toBe(false)
  })

  it.each([
    ['another property’s file', { path: `properties/13/${UUID(1)}.jpg` }],
    ['a room file for a property', { path: `rooms/12/${UUID(1)}.jpg` }],
    ['a path traversal', { path: `properties/12/../13/${UUID(1)}.jpg` }],
    ['a made-up name', { path: 'properties/12/evil.jpg' }],
  ])('REFUSES to claim %s', async (_l, over) => {
    await expect(
      svc.registerUploads(property, [file(1, over)]),
    ).rejects.toMatchObject({ code: 'forbidden' })
    expect(repo.insertImages).not.toHaveBeenCalled()
    expect(repo.syncOwnerCover).not.toHaveBeenCalled()
  })

  it('rejects a cover that is not among the submitted files', async () => {
    await expect(
      svc.registerUploads(property, [file(1)], path(5)),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('fails — and cleans up — when an upload never finished', async () => {
    vi.mocked(repo.objectExists)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    await expect(
      svc.registerUploads(property, [file(1), file(2)]),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(repo.insertImages).not.toHaveBeenCalled()
    expect(repo.removeObjects).toHaveBeenCalledWith([path(1)]) // the one that did arrive is not left orphaned
  })

  it('re-submitting an already-saved file is harmless (no duplicate row)', async () => {
    vi.mocked(repo.listImages).mockResolvedValue([row(1, { isCover: true })])
    await svc.registerUploads(property, [file(1)])
    expect(vi.mocked(repo.insertImages).mock.calls[0][1]).toEqual([])
  })

  it('enforces the gallery limit', async () => {
    vi.mocked(repo.listImages).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) =>
        row(i + 1, { storagePath: path(i + 1, 'rooms/34') }),
      ),
    )
    await expect(
      svc.registerUploads(room, [file(9, { path: path(9, 'rooms/34') })]),
    ).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('cover and delete', () => {
  it('setCoverImage swaps the cover and mirrors it', async () => {
    vi.mocked(repo.getImage).mockResolvedValue(row(2, { ownerId: 12 }))
    vi.mocked(repo.listImages).mockResolvedValue([
      row(2, { isCover: true }),
      row(1),
    ])
    await svc.setCoverImage(property, 2)
    expect(repo.clearCover).toHaveBeenCalledOnce()
    expect(repo.markCover).toHaveBeenCalledWith('property', 2)
    expect(repo.syncOwnerCover).toHaveBeenCalledWith(
      property,
      `https://cdn/${path(2)}`,
    )
  })

  it("cannot touch another property's photo by guessing its id", async () => {
    vi.mocked(repo.getImage).mockResolvedValue(row(2, { ownerId: 999 }))
    await expect(svc.setCoverImage(property, 2)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(svc.removeImage(property, 2)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(repo.markCover).not.toHaveBeenCalled()
    expect(repo.deleteImageRow).not.toHaveBeenCalled()
    expect(repo.removeObjects).not.toHaveBeenCalled()
  })

  it('removing the cover deletes the file and promotes the next photo', async () => {
    vi.mocked(repo.getImage).mockResolvedValue(row(1, { isCover: true }))
    vi.mocked(repo.listImages)
      .mockResolvedValueOnce([row(2), row(3)])
      .mockResolvedValueOnce([row(2, { isCover: true }), row(3)])
    await svc.removeImage(property, 1)
    expect(repo.deleteImageRow).toHaveBeenCalledWith('property', 1)
    expect(repo.removeObjects).toHaveBeenCalledWith([path(1)])
    expect(repo.markCover).toHaveBeenCalledWith('property', 2)
    expect(repo.syncOwnerCover).toHaveBeenCalledWith(
      property,
      `https://cdn/${path(2)}`,
    )
  })

  it('removing the last photo clears the mirrored cover; removing a non-cover leaves it', async () => {
    vi.mocked(repo.getImage).mockResolvedValue(row(1, { isCover: true }))
    vi.mocked(repo.listImages).mockResolvedValue([])
    await svc.removeImage(property, 1)
    expect(repo.syncOwnerCover).toHaveBeenCalledWith(property, null)

    vi.clearAllMocks()
    vi.mocked(repo.getImage).mockResolvedValue(row(3))
    vi.mocked(repo.listImages).mockResolvedValue([row(2, { isCover: true })])
    await svc.removeImage(property, 3)
    expect(repo.syncOwnerCover).toHaveBeenCalledWith(
      property,
      `https://cdn/${path(2)}`,
    )
  })
})
