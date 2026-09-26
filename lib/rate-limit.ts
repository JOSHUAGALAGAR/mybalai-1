/**
 * A small in-memory sliding-window limiter for the few public forms (no sign-in, so no user to
 * count against). It is per server instance: enough to stop one visitor hammering the form, not a
 * substitute for a shared store if the site runs on many instances.
 */
export type RateLimiter = {
  /** Record an attempt for `key`. Returns false when the key has used up its allowance. */
  hit: (key: string, now?: number) => boolean
}

export function createRateLimiter(options: {
  max: number
  windowMs: number
  maxKeys?: number
}): RateLimiter {
  const seen = new Map<string, number[]>()
  const maxKeys = options.maxKeys ?? 5000
  return {
    hit(key, now = Date.now()) {
      const recent = (seen.get(key) ?? []).filter(
        (t) => now - t < options.windowMs,
      )
      if (recent.length >= options.max) {
        seen.set(key, recent)
        return false
      }
      recent.push(now)
      seen.set(key, recent)
      if (seen.size > maxKeys) {
        // forget the keys that have gone quiet, so the map cannot grow without bound
        for (const [k, times] of seen) {
          if (times.every((t) => now - t >= options.windowMs)) seen.delete(k)
        }
      }
      return true
    },
  }
}

/** The visitor's address as the proxy reports it (first hop), or a shared bucket when unknown. */
export function clientIp(headers: {
  get(name: string): string | null
}): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}
