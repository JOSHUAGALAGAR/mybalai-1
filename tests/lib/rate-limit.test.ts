import { describe, expect, it } from 'vitest'

import { clientIp, createRateLimiter } from '@/lib/rate-limit'

describe('rate limiter', () => {
  it('allows the allowance, then refuses, then lets the visitor back in when the window passes', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000 })
    expect([1, 2, 3].map(() => limiter.hit('a', 0))).toEqual([true, true, true])
    expect(limiter.hit('a', 500)).toBe(false)
    expect(limiter.hit('a', 1001)).toBe(true)
  })
  it('counts each visitor separately', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 })
    expect(limiter.hit('a', 0)).toBe(true)
    expect(limiter.hit('b', 0)).toBe(true)
    expect(limiter.hit('a', 1)).toBe(false)
  })
  it('does not grow without bound', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 10, maxKeys: 5 })
    for (let i = 0; i < 50; i++) limiter.hit(`k${i}`, i * 100)
    expect(limiter.hit('fresh', 10_000)).toBe(true)
  })
})

describe('clientIp', () => {
  const h = (map: Record<string, string>) => ({
    get: (n: string) => map[n] ?? null,
  })
  it('takes the first forwarded address, then the real-ip header, then a shared bucket', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe(
      '1.2.3.4',
    )
    expect(clientIp(h({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8')
    expect(clientIp(h({}))).toBe('unknown')
  })
})
