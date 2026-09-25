import { describe, expect, it } from 'vitest'

import {
  MAX_IMAGE_BYTES,
  MAX_PROPERTY_IMAGES,
  MAX_ROOM_IMAGES,
  extensionFor,
  isPathForTarget,
  newStoragePath,
  storagePrefix,
  validateBatch,
  validateImageFile,
  type ImageTarget,
} from '@/lib/images/rules'

const property: ImageTarget = { kind: 'property', propertyId: 12 }
const room: ImageTarget = { kind: 'room', propertyId: 12, roomId: 34 }
const UUID = '123e4567-e89b-12d3-a456-426614174000'
const jpg = (over = {}) => ({
  type: 'image/jpeg',
  size: 1000,
  name: 'a.jpg',
  ...over,
})

describe('validateImageFile', () => {
  it('accepts JPG, PNG and WebP up to 5 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateImageFile(jpg({ type }))).toBeNull()
    }
    expect(validateImageFile(jpg({ size: MAX_IMAGE_BYTES }))).toBeNull()
  })

  it.each([
    ['gif', 'image/gif'],
    ['svg (can carry scripts)', 'image/svg+xml'],
    ['heic', 'image/heic'],
    ['pdf', 'application/pdf'],
    ['unknown', ''],
  ])('rejects %s', (_l, type) => {
    expect(validateImageFile(jpg({ type }))).toMatch(/JPG, PNG or WebP/)
  })

  it('rejects empty and oversized files, naming the file', () => {
    expect(validateImageFile(jpg({ size: 0 }))).toMatch(/empty/)
    expect(
      validateImageFile(jpg({ size: MAX_IMAGE_BYTES + 1, name: 'big.jpg' })),
    ).toMatch(/big\.jpg.*5 MB/)
  })
})

describe('validateBatch', () => {
  it('needs at least one file', () => {
    expect(validateBatch(property, 0, [])).toMatch(/at least one/)
  })

  it('enforces the per-target limit including what is already uploaded', () => {
    const many = (n: number) => Array.from({ length: n }, () => jpg())
    expect(validateBatch(property, 0, many(MAX_PROPERTY_IMAGES))).toBeNull()
    expect(validateBatch(property, 0, many(MAX_PROPERTY_IMAGES + 1))).toMatch(
      /limit 12/,
    )
    expect(validateBatch(property, 10, many(3))).toMatch(/2 more photos/)
    expect(validateBatch(property, 11, many(2))).toMatch(/1 more photo /)
    expect(validateBatch(room, MAX_ROOM_IMAGES, many(1))).toMatch(
      /maximum of 8/,
    )
  })

  it('reports the first bad file', () => {
    expect(
      validateBatch(property, 0, [
        jpg(),
        jpg({ type: 'image/gif', name: 'x.gif' }),
      ]),
    ).toMatch(/x\.gif/)
  })
})

describe('paths', () => {
  it('builds a path in the target folder from the MIME type, never from the filename', () => {
    expect(newStoragePath(property, 'image/png', UUID)).toBe(
      `properties/12/${UUID}.png`,
    )
    expect(newStoragePath(room, 'image/jpeg', UUID)).toBe(
      `rooms/34/${UUID}.jpg`,
    )
    expect(newStoragePath(room, 'image/gif', UUID)).toBeNull()
    expect(extensionFor('image/webp')).toBe('webp')
    expect(storagePrefix(room)).toBe('rooms/34/')
  })

  it('accepts only paths we would have issued for that exact target', () => {
    expect(isPathForTarget(`properties/12/${UUID}.jpg`, property)).toBe(true)
    expect(isPathForTarget(`rooms/34/${UUID}.webp`, room)).toBe(true)
  })

  it.each([
    ['another property', `properties/13/${UUID}.jpg`],
    ['a room path for a property', `rooms/12/${UUID}.jpg`],
    ['path traversal', `properties/12/../13/${UUID}.jpg`],
    ['a made-up name', 'properties/12/evil.jpg'],
    ['a wrong extension', `properties/12/${UUID}.exe`],
    ['a nested folder', `properties/12/x/${UUID}.jpg`],
    ['the folder itself', 'properties/12/'],
    ['another bucket area', `receipts/12/${UUID}.jpg`],
  ])('rejects %s', (_l, path) => {
    expect(isPathForTarget(path, property)).toBe(false)
  })
})
