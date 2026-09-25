import { describe, expect, it } from 'vitest'

import {
  avatarRequestSchema,
  decisionSchema,
  idSubmitSchema,
  verificationRequestSchema,
} from '@/schemas/verification'

const file = { name: 'a.jpg', type: 'image/jpeg', size: 1000 }

describe('decisionSchema', () => {
  it('approve needs no reason', () => {
    expect(decisionSchema.safeParse({ decision: 'approve' }).success).toBe(true)
    expect(
      decisionSchema.safeParse({ decision: 'approve', reason: '  ' }).success,
    ).toBe(true)
  })
  it('reject must say why (5–500 characters)', () => {
    expect(decisionSchema.safeParse({ decision: 'reject' }).success).toBe(false)
    expect(
      decisionSchema.safeParse({ decision: 'reject', reason: '   ' }).success,
    ).toBe(false)
    expect(
      decisionSchema.safeParse({ decision: 'reject', reason: 'blur' }).success,
    ).toBe(false)
    expect(
      decisionSchema.parse({
        decision: 'reject',
        reason: '  The photo is blurry.  ',
      }).reason,
    ).toBe('The photo is blurry.')
    expect(
      decisionSchema.safeParse({ decision: 'reject', reason: 'x'.repeat(501) })
        .success,
    ).toBe(false)
  })
  it('refuses anything else', () => {
    expect(decisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false)
    expect(decisionSchema.safeParse({}).success).toBe(false)
  })
})

describe('verification requests', () => {
  it('prepare needs an ID type and both files', () => {
    expect(
      verificationRequestSchema.safeParse({
        op: 'prepare',
        idType: 'philsys',
        front: file,
        back: file,
      }).success,
    ).toBe(true)
    expect(
      verificationRequestSchema.safeParse({
        op: 'prepare',
        idType: 'philsys',
        front: file,
      }).success,
    ).toBe(false)
    expect(
      verificationRequestSchema.safeParse({
        op: 'prepare',
        idType: 'library-card',
        front: file,
        back: file,
      }).success,
    ).toBe(false)
  })
  it('submit needs the two paths', () => {
    expect(
      idSubmitSchema.safeParse({
        idType: 'passport',
        frontPath: 'a',
        backPath: 'b',
      }).success,
    ).toBe(true)
    expect(
      verificationRequestSchema.safeParse({
        op: 'submit',
        idType: 'passport',
        frontPath: 'a',
      }).success,
    ).toBe(false)
    expect(verificationRequestSchema.safeParse({ op: 'approve' }).success).toBe(
      false,
    )
  })
  it('avatar operations', () => {
    expect(
      avatarRequestSchema.safeParse({ op: 'prepare', ...file }).success,
    ).toBe(true)
    expect(
      avatarRequestSchema.safeParse({ op: 'register', path: 'avatars/1/x.jpg' })
        .success,
    ).toBe(true)
    expect(avatarRequestSchema.safeParse({ op: 'remove' }).success).toBe(true)
    expect(avatarRequestSchema.safeParse({ op: 'register' }).success).toBe(
      false,
    )
  })
})
