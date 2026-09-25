import { describe, expect, it, vi } from 'vitest'

import { memoAsync } from '@/lib/utilities/memo-async'

describe('memoAsync', () => {
  it('loads once within the TTL and again after it expires', async () => {
    let t = 0
    const load = vi.fn().mockResolvedValue('v')
    const get = memoAsync(load, 1000, { now: () => t })
    await get()
    await get()
    t = 999
    await get()
    expect(load).toHaveBeenCalledTimes(1)
    t = 1000
    await get()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight load between concurrent callers', async () => {
    const load = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return 42
    })
    const get = memoAsync(load, 1000)
    const results = await Promise.all([get(), get(), get()])
    expect(results).toEqual([42, 42, 42])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok')
    const get = memoAsync(load, 1000)
    await expect(get()).rejects.toThrow('boom')
    await expect(get()).resolves.toBe('ok')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('hands each caller a private copy when asked', async () => {
    const get = memoAsync(async () => [3, 1, 2], 1000, { copy: (a) => [...a] })
    const a = await get()
    a.sort()
    a.push(99)
    expect(await get()).toEqual([3, 1, 2])
  })

  it('reset() forces a reload', async () => {
    const load = vi.fn().mockResolvedValue(1)
    const get = memoAsync(load, 60_000)
    await get()
    get.reset()
    await get()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
