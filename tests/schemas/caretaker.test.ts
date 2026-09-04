import { describe, expect, it } from 'vitest'

import { assignmentsSchema, createCaretakerSchema } from '@/schemas/caretaker'

describe('createCaretakerSchema', () => {
  const ok = {
    fullName: 'Cara Taker',
    email: 'cara@example.com',
    password: 'temp12345',
  }
  it('accepts valid input', () => {
    expect(createCaretakerSchema.safeParse(ok).success).toBe(true)
  })
  it('rejects a short password and a bad email', () => {
    expect(
      createCaretakerSchema.safeParse({ ...ok, password: 'x' }).success,
    ).toBe(false)
    expect(
      createCaretakerSchema.safeParse({ ...ok, email: 'nope' }).success,
    ).toBe(false)
  })
})

describe('assignmentsSchema', () => {
  it('coerces string ids and defaults to empty', () => {
    expect(assignmentsSchema.safeParse({}).data?.property_ids).toEqual([])
    const r = assignmentsSchema.safeParse({ property_ids: ['3', '7'] })
    expect(r.success && r.data.property_ids).toEqual([3, 7])
  })
  it('rejects non-positive ids', () => {
    expect(assignmentsSchema.safeParse({ property_ids: ['0'] }).success).toBe(
      false,
    )
  })
})
