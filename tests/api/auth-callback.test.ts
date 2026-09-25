import { beforeEach, describe, expect, it, vi } from 'vitest'

const exchange = vi.fn()
const getClaims = vi.fn()
const signOut = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: exchange, getClaims, signOut },
  }),
}))
vi.mock('@/repositories/users.repository', () => ({
  getAccountByAuthId: vi.fn(),
  getRoleCodes: vi.fn(),
}))
vi.mock('@/lib/auth/dal', async () => {
  // the real (pure) claim parser, without pulling in the rest of the DAL
  return {
    authMethodsFromClaims: (claims: { amr?: unknown } | null | undefined) =>
      Array.isArray(claims?.amr)
        ? (claims!.amr as { method?: string }[])
            .map((a) => a.method)
            .filter(Boolean)
        : [],
  }
})

const users = await import('@/repositories/users.repository')
const { GET } = await import('@/app/auth/callback/route')

const call = (query = 'code=abc&next=/dashboard') =>
  GET(new Request(`https://mybalai.example/auth/callback?${query}`) as never)

function signIn(method: string, roles: string[]) {
  exchange.mockResolvedValue({
    data: { user: { id: 'auth-1' }, session: {} },
    error: null,
  })
  getClaims.mockResolvedValue({ data: { claims: { amr: [{ method }] } } })
  vi.mocked(users.getAccountByAuthId).mockResolvedValue({
    legacy_user_id: 9,
  } as never)
  vi.mocked(users.getRoleCodes).mockResolvedValue(roles)
}

beforeEach(() => vi.clearAllMocks())

describe('GET /auth/callback', () => {
  it('signs a landlord back OUT when they came in with Google', async () => {
    signIn('oauth', ['landlord'])
    const res = await call()
    expect(signOut).toHaveBeenCalledOnce()
    expect(res.headers.get('location')).toBe(
      'https://mybalai.example/login?error=landlord_google',
    )
  })

  it('lets a Google tenant through to the requested page', async () => {
    signIn('oauth', ['tenant'])
    const res = await call()
    expect(signOut).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe(
      'https://mybalai.example/dashboard',
    )
  })

  it('does not touch a landlord finishing a password-recovery link (not an OAuth session)', async () => {
    signIn('otp', ['landlord'])
    const res = await call('code=abc&next=/reset-password')
    expect(signOut).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe(
      'https://mybalai.example/reset-password',
    )
  })

  it('fails safe when the code is bad', async () => {
    exchange.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('bad'),
    })
    const res = await call()
    expect(res.headers.get('location')).toBe(
      'https://mybalai.example/login?error=oauth',
    )
    expect(signOut).not.toHaveBeenCalled()
  })

  it('never redirects off-site via `next`', async () => {
    signIn('oauth', ['tenant'])
    const res = await call('code=abc&next=//evil.example')
    expect(res.headers.get('location')).toBe(
      'https://mybalai.example/dashboard',
    )
  })
})
