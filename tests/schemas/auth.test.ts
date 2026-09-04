import { describe, expect, it } from 'vitest'

import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '@/schemas/auth'

describe('loginSchema', () => {
  it('accepts a valid email + password', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success,
    ).toBe(true)
  })
  it('rejects a bad email', () => {
    expect(
      loginSchema.safeParse({ email: 'nope', password: 'x' }).success,
    ).toBe(false)
  })
  it('rejects an empty password', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.com', password: '' }).success,
    ).toBe(false)
  })
})

describe('signupSchema', () => {
  const base = {
    fullName: 'Rita Tenant',
    email: 'rita@example.com',
    password: 'supersecret',
    confirmPassword: 'supersecret',
  }

  it('accepts a valid signup', () => {
    expect(signupSchema.safeParse(base).success).toBe(true)
  })

  it('rejects mismatched passwords with a confirmPassword error', () => {
    const result = signupSchema.safeParse({
      ...base,
      confirmPassword: 'different',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.flatMap((i) => i.path)
      expect(paths).toContain('confirmPassword')
    }
  })

  it('rejects a short password', () => {
    expect(
      signupSchema.safeParse({
        ...base,
        password: 'short',
        confirmPassword: 'short',
      }).success,
    ).toBe(false)
  })

  it('rejects a one-character name', () => {
    expect(signupSchema.safeParse({ ...base, fullName: 'R' }).success).toBe(
      false,
    )
  })
})

describe('forgotPasswordSchema', () => {
  it('accepts an email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(
      true,
    )
  })
})

describe('resetPasswordSchema', () => {
  it('requires the two passwords to match', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'longenough',
        confirmPassword: 'longenough',
      }).success,
    ).toBe(true)
    expect(
      resetPasswordSchema.safeParse({
        password: 'longenough',
        confirmPassword: 'nope',
      }).success,
    ).toBe(false)
  })
})
