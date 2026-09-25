import { describe, expect, it } from 'vitest'

import { authMethodsFromClaims, lastAuthTimestamp } from '@/lib/auth/claims'

describe('lastAuthTimestamp', () => {
  it('finds when the password was last typed in', () => {
    const claims = {
      amr: [
        { method: 'password', timestamp: 1_000 },
        { method: 'oauth', timestamp: 2_000 },
      ],
    }
    expect(lastAuthTimestamp(claims, 'password')).toBe(1_000)
    expect(lastAuthTimestamp(claims, 'oauth')).toBe(2_000)
  })
  it('takes the most recent when a method appears more than once', () => {
    expect(
      lastAuthTimestamp(
        {
          amr: [
            { method: 'password', timestamp: 100 },
            { method: 'password', timestamp: 900 },
          ],
        },
        'password',
      ),
    ).toBe(900)
  })
  it('null when the method was not used or the claim is missing/odd', () => {
    expect(
      lastAuthTimestamp(
        { amr: [{ method: 'oauth', timestamp: 5 }] },
        'password',
      ),
    ).toBeNull()
    expect(lastAuthTimestamp({}, 'password')).toBeNull()
    expect(lastAuthTimestamp(null, 'password')).toBeNull()
    expect(lastAuthTimestamp({ amr: 'password' }, 'password')).toBeNull()
    expect(lastAuthTimestamp({ amr: ['password'] }, 'password')).toBeNull()
    expect(
      lastAuthTimestamp(
        { amr: [{ method: 'password', timestamp: '5' }] },
        'password',
      ),
    ).toBeNull()
  })
  it('authMethodsFromClaims still lists the methods', () => {
    expect(
      authMethodsFromClaims({
        amr: [{ method: 'password', timestamp: 1 }, 'otp'],
      }),
    ).toEqual(['password', 'otp'])
  })
})
