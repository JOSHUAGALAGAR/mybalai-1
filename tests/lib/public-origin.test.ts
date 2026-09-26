import { describe, expect, it } from 'vitest'

import { publicOrigin } from '@/lib/public-origin'

const req = (headers: Record<string, string> = {}) =>
  new Request('https://localhost:3004/auth/callback?code=x', { headers })

describe('publicOrigin', () => {
  it('uses the configured site address in production, whatever the internal request URL says', () => {
    expect(
      publicOrigin(req(), {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://mybalai.delxtdev.cloud/',
      }),
    ).toBe('https://mybalai.delxtdev.cloud')
  })

  it('falls back to the forwarded headers', () => {
    expect(
      publicOrigin(
        req({
          'x-forwarded-host': 'app.example.com',
          'x-forwarded-proto': 'https',
        }),
        { NODE_ENV: 'production' },
      ),
    ).toBe('https://app.example.com')
  })

  it('ignores a localhost Host header and keeps the request origin in development', () => {
    expect(
      publicOrigin(req({ host: 'localhost:3000' }), {
        NODE_ENV: 'development',
      }),
    ).toBe('https://localhost:3004')
    expect(
      publicOrigin(new Request('http://192.168.1.19:3000/x'), {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      }),
    ).toBe('http://192.168.1.19:3000')
  })

  it('survives a broken configured address', () => {
    expect(
      publicOrigin(req(), {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'not a url',
      }),
    ).toBe('https://localhost:3004')
  })
})
