import { describe, expect, it } from 'vitest'

import { mobileImageRequestSchema } from '@/schemas/images'
import { roomRequirementsSchema } from '@/schemas/room'

const room = { kind: 'room', propertyId: 1, roomId: 2 }

describe('mobileImageRequestSchema', () => {
  it('accepts each operation', () => {
    for (const body of [
      {
        op: 'prepare',
        target: room,
        files: [{ name: 'a.jpg', type: 'image/jpeg', size: 10 }],
      },
      {
        op: 'register',
        target: room,
        files: [
          {
            path: 'rooms/2/x.jpg',
            name: 'a.jpg',
            type: 'image/jpeg',
            size: 10,
          },
        ],
        coverPath: 'rooms/2/x.jpg',
      },
      { op: 'cover', target: { kind: 'property', propertyId: 1 }, imageId: 5 },
      { op: 'remove', target: room, imageId: 5 },
    ]) {
      expect(mobileImageRequestSchema.safeParse(body).success).toBe(true)
    }
  })

  it('rejects unknown ops, bad ids, empty and oversized batches', () => {
    const file = { name: 'a.jpg', type: 'image/jpeg', size: 1 }
    for (const body of [
      { op: 'delete-all', target: room },
      { op: 'cover', target: room, imageId: -1 },
      { op: 'cover', target: { kind: 'room', propertyId: 1 }, imageId: 1 },
      { op: 'prepare', target: room, files: [] },
      { op: 'prepare', target: room, files: Array(21).fill(file) },
      { op: 'prepare', target: room, files: [{ ...file, size: -1 }] },
    ]) {
      expect(mobileImageRequestSchema.safeParse(body).success).toBe(false)
    }
  })
})

describe('roomRequirementsSchema', () => {
  it('needs both switches as real booleans', () => {
    expect(
      roomRequirementsSchema.safeParse({
        require_advance: true,
        require_deposit: false,
      }).success,
    ).toBe(true)
    expect(
      roomRequirementsSchema.safeParse({ require_advance: true }).success,
    ).toBe(false)
    expect(
      roomRequirementsSchema.safeParse({
        require_advance: 'yes',
        require_deposit: false,
      }).success,
    ).toBe(false)
  })
})
