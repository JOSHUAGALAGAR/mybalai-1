import { beforeEach, describe, expect, it, vi } from 'vitest'

// The signed-in person is read from the session cookie's JWT (verified locally — no Auth call)…
const getClaims = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims, getUser } }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
}))

// …and the account + roles come from the database in ONE request.
let accountQueries = 0
let account: Record<string, unknown> | null
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'roles') {
        return {
          select: async () => ({
            data: [
              { role_id: 1, role_code: 'tenant' },
              { role_id: 5, role_code: 'superadmin' },
            ],
            error: null,
          }),
        }
      }
      return {
        select: (columns: string) => {
          if (table === 'user_accounts') accountQueries += 1
          // the roles must ride along in the same query, never a second one
          expect(table).toBe('user_accounts')
          expect(columns).toContain('user_roles')
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: account, error: null }),
            }),
          }
        },
      }
    },
  }),
}))

const dal = await import('@/lib/auth/dal')

const row = (over: Record<string, unknown> = {}) => ({
  legacy_user_id: 7,
  email: 'ana@example.com',
  full_name: 'Ana',
  phone: null,
  address: null,
  avatar_url: null,
  is_active: true,
  user_roles: [{ role_id: 1 }],
  ...over,
})

beforeEach(() => {
  accountQueries = 0
  account = row()
  getClaims.mockReset().mockResolvedValue({
    data: { claims: { sub: 'auth-1', email: 'ana@example.com' } },
    error: null,
  })
  getUser.mockReset()
  dal.invalidateCurrentUser('auth-1')
})

describe('getCurrentUser', () => {
  it('identifies the person without calling Supabase Auth, and loads account + roles in one query', async () => {
    const user = await dal.getCurrentUser()
    expect(user).toMatchObject({
      legacyUserId: 7,
      fullName: 'Ana',
      roles: ['tenant'],
      isActive: true,
    })
    expect(getUser).not.toHaveBeenCalled() // the ~300 ms network check is gone
    expect(accountQueries).toBe(1)
  })

  it('remembers the person briefly, so the next page does not hit the database again', async () => {
    await dal.getCurrentUser()
    await dal.getCurrentUser()
    await dal.getCurrentUser()
    expect(accountQueries).toBe(1)
  })

  it('forgets them the moment their account changes (their own next request sees it)', async () => {
    await dal.getCurrentUser()
    account = row({ full_name: 'Ana Reyes' })
    dal.invalidateCurrentUser('auth-1')
    expect((await dal.getCurrentUser())?.fullName).toBe('Ana Reyes')
    expect(accountQueries).toBe(2)
  })

  it('a copy of the cached user cannot be used to change the cached roles', async () => {
    const first = await dal.getCurrentUser()
    first!.roles.push('superadmin')
    expect((await dal.getCurrentUser())?.roles).toEqual(['tenant'])
  })

  it('no valid session means no user (and no database query)', async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error('no session') })
    expect(await dal.getCurrentUser()).toBeNull()
    expect(accountQueries).toBe(0)
  })

  it('a sign-in without a MyBalai profile is treated as signed out', async () => {
    account = null
    expect(await dal.getCurrentUser()).toBeNull()
  })

  it('a deactivated account is refused even though its session is still valid', async () => {
    account = row({ is_active: false })
    await expect(dal.requireUser()).rejects.toThrow('redirect:/unauthorized')
  })
})
