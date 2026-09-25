import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '@/lib/auth/dal'
import type { AppRole } from '@/lib/auth/roles'

vi.mock('@/lib/auth/dal', () => ({
  getCurrentUser: vi.fn(),
  getSessionAuthMethods: vi.fn().mockResolvedValue(['password']),
}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))

const { getCurrentUser, getSessionAuthMethods } = await import('@/lib/auth/dal')
const { ServiceError } = await import('@/services/errors')
const { idParam, mobileRoute } = await import('@/lib/api/mobile')

const asUser = vi.mocked(getCurrentUser)

function user(roles: AppRole[], over: Partial<CurrentUser> = {}): CurrentUser {
  return {
    authUserId: 'u',
    legacyUserId: 7,
    email: 't@example.com',
    fullName: 'Test Tenant',
    phone: null,
    address: null,
    avatarUrl: null,
    isActive: true,
    roles,
    ...over,
  }
}

const req = new Request('http://localhost/api/mobile/x')
const ctx = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
})

async function call(handler: ReturnType<typeof mobileRoute>) {
  const res = await handler(req, ctx() as never)
  return { status: res.status, body: await res.json(), res }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionAuthMethods).mockResolvedValue(['password'])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('mobileRoute auth gate', () => {
  it('401 without a valid session and never runs the handler', async () => {
    asUser.mockResolvedValue(null)
    const handler = vi.fn()
    const { status, body } = await call(mobileRoute(handler))
    expect(status).toBe(401)
    expect(body.error.code).toBe('unauthenticated')
    expect(handler).not.toHaveBeenCalled()
  })

  it('403 for a deactivated account', async () => {
    asUser.mockResolvedValue(user(['tenant'], { isActive: false }))
    const handler = vi.fn()
    const { status } = await call(mobileRoute(handler))
    expect(status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([['caretaker'], ['superadmin']] as [AppRole][])(
    '403 unsupported_role for a %s-only account (web dashboard only)',
    async (role) => {
      asUser.mockResolvedValue(user([role]))
      const handler = vi.fn()
      const { status, body } = await call(
        mobileRoute(handler, { roles: ['tenant', 'landlord'] }),
      )
      expect(status).toBe(403)
      expect(body.error.code).toBe('unsupported_role')
      expect(handler).not.toHaveBeenCalled()
    },
  )

  it('a landlord cannot call a tenant-only endpoint (and vice versa)', async () => {
    const tenantOnly = vi.fn()
    const landlordOnly = vi.fn()
    asUser.mockResolvedValue(user(['landlord']))
    let r = await call(mobileRoute(tenantOnly))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('wrong_role')

    asUser.mockResolvedValue(user(['tenant']))
    r = await call(mobileRoute(landlordOnly, { roles: ['landlord'] }))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('wrong_role')
    expect(tenantOnly).not.toHaveBeenCalled()
    expect(landlordOnly).not.toHaveBeenCalled()
  })

  it('serves each role on the endpoints that allow it', async () => {
    const handler = vi.fn().mockResolvedValue('ok')
    for (const role of ['tenant', 'landlord'] as const) {
      asUser.mockResolvedValue(user([role]))
      expect(
        (await call(mobileRoute(handler, { roles: ['tenant', 'landlord'] })))
          .status,
      ).toBe(200)
    }
    asUser.mockResolvedValue(user(['landlord']))
    expect(
      (await call(mobileRoute(handler, { roles: ['landlord'] }))).status,
    ).toBe(200)
  })

  it('REFUSES a landlord whose session came from Google — on every endpoint', async () => {
    vi.mocked(getSessionAuthMethods).mockResolvedValue(['oauth'])
    asUser.mockResolvedValue(user(['landlord']))
    const handler = vi.fn()
    for (const opts of [
      { roles: ['landlord' as const] },
      { roles: ['tenant' as const, 'landlord' as const] },
    ]) {
      const { status, body } = await call(mobileRoute(handler, opts))
      expect(status).toBe(403)
      expect(body.error.code).toBe('landlord_no_google')
      expect(body.error.message).toMatch(/email and password/)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('also refuses a dual-role (tenant + landlord) account signed in with Google', async () => {
    vi.mocked(getSessionAuthMethods).mockResolvedValue(['oauth'])
    asUser.mockResolvedValue(user(['tenant', 'landlord']))
    const { status, body } = await call(
      mobileRoute(vi.fn(), { roles: ['tenant'] }),
    )
    expect(status).toBe(403)
    expect(body.error.code).toBe('landlord_no_google')
  })

  it('still lets a landlord in with a password session, and a tenant in with Google', async () => {
    const handler = vi.fn().mockResolvedValue('ok')
    vi.mocked(getSessionAuthMethods).mockResolvedValue(['password'])
    asUser.mockResolvedValue(user(['landlord']))
    expect(
      (await call(mobileRoute(handler, { roles: ['landlord'] }))).status,
    ).toBe(200)

    vi.mocked(getSessionAuthMethods).mockResolvedValue(['oauth'])
    asUser.mockResolvedValue(user(['tenant']))
    expect((await call(mobileRoute(handler))).status).toBe(200)
  })

  it('runs the handler for a tenant and wraps the result in { data }', async () => {
    asUser.mockResolvedValue(user(['tenant']))
    const handler = vi.fn().mockResolvedValue({ ok: true })
    const { status, body, res } = await call(mobileRoute(handler))
    expect(status).toBe(200)
    expect(body).toEqual({ data: { ok: true } })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('passes resolved route params to the handler', async () => {
    asUser.mockResolvedValue(user(['tenant']))
    const handler = vi.fn().mockResolvedValue(null)
    await mobileRoute<{ id: string }>(handler)(req, ctx({ id: '42' }) as never)
    expect(handler.mock.calls[0][0].params).toEqual({ id: '42' })
  })
})

describe('mobileRoute error mapping', () => {
  beforeEach(() => asUser.mockResolvedValue(user(['tenant'])))

  it.each([
    ['forbidden', 403],
    ['not_found', 404],
    ['validation', 422],
    ['conflict', 409],
    ['unknown', 400],
  ] as const)('maps ServiceError %s -> %i', async (code, status) => {
    const { status: got, body } = await call(
      mobileRoute(async () => {
        throw new ServiceError('nope', code, { field: ['bad'] })
      }),
    )
    expect(got).toBe(status)
    expect(body.error).toMatchObject({
      code,
      message: 'nope',
      fieldErrors: { field: ['bad'] },
    })
  })

  it('maps a redirect to /login (signed out) to 401', async () => {
    const { status } = await call(
      mobileRoute(async () => {
        throw Object.assign(new Error('r'), {
          digest: 'NEXT_REDIRECT;replace;/login;307;',
        })
      }),
    )
    expect(status).toBe(401)
  })

  it('maps a redirect to /unauthorized to 403', async () => {
    const { status } = await call(
      mobileRoute(async () => {
        throw Object.assign(new Error('r'), {
          digest: 'NEXT_REDIRECT;replace;/unauthorized;307;',
        })
      }),
    )
    expect(status).toBe(403)
  })

  it('returns a generic 500 and does not leak internal error text', async () => {
    const { status, body } = await call(
      mobileRoute(async () => {
        throw new Error('connection string postgres://secret@db')
      }),
    )
    expect(status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})

describe('idParam', () => {
  it('accepts positive integers and 404s otherwise', () => {
    expect(idParam('12')).toBe(12)
    for (const bad of ['0', '-1', '1.5', 'abc', '', undefined]) {
      expect(() => idParam(bad)).toThrow(ServiceError)
    }
  })
})
