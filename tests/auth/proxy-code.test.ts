import { describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/supabase/proxy', () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}))

const { proxy } = await import('@/proxy')
const { updateSession } = await import('@/lib/supabase/proxy')

const req = (path: string) =>
  new NextRequest(`https://mybalai.delxtdev.cloud${path}`)

describe('proxy', () => {
  it('sends a stray sign-in code on the home page to the auth callback', async () => {
    const res = await proxy(req('/?code=abc-123'))
    expect(res.status).toBe(307)
    const to = new URL(res.headers.get('location')!)
    expect(to.pathname).toBe('/auth/callback')
    expect(to.searchParams.get('code')).toBe('abc-123')
    expect(to.origin).toBe('https://mybalai.delxtdev.cloud')
    expect(updateSession).not.toHaveBeenCalled()
  })

  it('leaves the home page and other pages alone', async () => {
    await proxy(req('/'))
    await proxy(req('/login?code=x'))
    expect(updateSession).toHaveBeenCalledTimes(2)
  })
})
