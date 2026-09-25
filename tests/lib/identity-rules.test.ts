import { describe, expect, it } from 'vitest'

import {
  ID_TYPES,
  idTypeLabel,
  isAvatarPathFor,
  isIdPathFor,
  MAX_AVATAR_BYTES,
  MAX_ID_BYTES,
  newAvatarPath,
  newIdPath,
  validateUploadFile,
} from '@/lib/identity/rules'

describe('validateUploadFile', () => {
  it('accepts JPG/PNG/WebP within the limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateUploadFile({ type, size: 1000 }, MAX_ID_BYTES)).toBeNull()
    }
  })
  it('refuses other types, empty and oversized files, naming the file', () => {
    expect(
      validateUploadFile(
        { type: 'application/pdf', size: 10, name: 'id.pdf' },
        MAX_ID_BYTES,
      ),
    ).toMatch(/id\.pdf.*supported/)
    expect(
      validateUploadFile({ type: 'image/heic', size: 10 }, MAX_ID_BYTES),
    ).toMatch(/supported/)
    expect(
      validateUploadFile({ type: 'image/png', size: 0 }, MAX_ID_BYTES),
    ).toMatch(/empty/)
    expect(
      validateUploadFile(
        { type: 'image/png', size: MAX_ID_BYTES + 1 },
        MAX_ID_BYTES,
      ),
    ).toMatch(/8 MB/)
    expect(
      validateUploadFile(
        { type: 'image/png', size: MAX_AVATAR_BYTES + 1 },
        MAX_AVATAR_BYTES,
      ),
    ).toMatch(/3 MB/)
  })
})

describe('server-named paths', () => {
  it('avatar paths belong to exactly one user', () => {
    const path = newAvatarPath(42, 'image/jpeg')!
    expect(path).toMatch(/^avatars\/42\/[0-9a-f-]{36}\.jpg$/)
    expect(isAvatarPathFor(path, 42)).toBe(true)
    expect(isAvatarPathFor(path, 43)).toBe(false)
    expect(isAvatarPathFor(path.replace('avatars/42', 'avatars/420'), 42)).toBe(
      false,
    )
    expect(newAvatarPath(42, 'image/gif')).toBeNull()
  })

  it('ID paths are per user AND per side', () => {
    const front = newIdPath(7, 'front', 'image/png')!
    const back = newIdPath(7, 'back', 'image/webp')!
    expect(front).toMatch(/^identity\/7\/[0-9a-f-]{36}-front\.png$/)
    expect(isIdPathFor(front, 7, 'front')).toBe(true)
    expect(isIdPathFor(front, 7, 'back')).toBe(false) // the front file can't pose as the back
    expect(isIdPathFor(back, 7, 'back')).toBe(true)
    expect(isIdPathFor(front, 8, 'front')).toBe(false) // another user's file
  })

  it('rejects traversal and look-alike paths', () => {
    const uuid = crypto.randomUUID()
    for (const bad of [
      `identity/7/../8/${uuid}-front.jpg`,
      `identity/7/${uuid}-front.jpg.exe`,
      `identity/7/${uuid}-front.gif`,
      `/identity/7/${uuid}-front.jpg`,
      `identity/7/${uuid}-front.jpg/x`,
      `avatars/7/${uuid}-front.jpg`,
    ]) {
      expect(isIdPathFor(bad, 7, 'front'), bad).toBe(false)
    }
    expect(isAvatarPathFor(`avatars/7/../8/${uuid}.jpg`, 7)).toBe(false)
  })

  it('two paths for the same user never collide', () => {
    expect(newIdPath(7, 'front', 'image/png')).not.toBe(
      newIdPath(7, 'front', 'image/png'),
    )
  })
})

describe('ID types', () => {
  it('has readable labels for the common Philippine IDs', () => {
    expect(ID_TYPES.length).toBeGreaterThanOrEqual(8)
    expect(idTypeLabel('philsys')).toMatch(/National ID/)
    expect(idTypeLabel('drivers_license')).toMatch(/Driver/)
    expect(idTypeLabel('unknown_thing')).toBe('unknown_thing')
  })
})
