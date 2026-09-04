import { describe, expect, it } from 'vitest'

import { APP_ROLES, SIGNUP_ROLES, isAppRole } from '@/lib/auth/roles'

describe('roles', () => {
  it('has exactly the four canonical account types (spec §38)', () => {
    expect([...APP_ROLES].sort()).toEqual(
      ['caretaker', 'landlord', 'superadmin', 'tenant'].sort(),
    )
  })

  it('does not contain the retired "admin" role', () => {
    expect((APP_ROLES as readonly string[]).includes('admin')).toBe(false)
  })

  it('only allows tenant self-signup (spec §42)', () => {
    expect([...SIGNUP_ROLES]).toEqual(['tenant'])
  })

  it('isAppRole guards unknown values', () => {
    expect(isAppRole('landlord')).toBe(true)
    expect(isAppRole('superadmin')).toBe(true)
    expect(isAppRole('admin')).toBe(false)
    expect(isAppRole(null)).toBe(false)
    expect(isAppRole(123)).toBe(false)
  })
})
