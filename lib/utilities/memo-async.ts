/**
 * Cache the result of an async, argument-less loader for `ttlMs`.
 *
 * - Concurrent callers share one in-flight promise (no thundering herd).
 * - A rejected load is NOT cached, so the next caller retries.
 * - `copy` lets callers get a private copy of a shared value (e.g. `(rows) => [...rows]`)
 *   so one caller mutating its result can't corrupt everyone else's.
 *
 * Meant for tiny, rarely-changing lookups (statuses, types, roles) where each
 * uncached call costs a full network round-trip to the database.
 */
export type Memoized<T> = {
  (): Promise<T>
  /** Drop the cached value (tests, or after a write to the underlying data). */
  reset(): void
}

export function memoAsync<T>(
  load: () => Promise<T>,
  ttlMs: number,
  options: { copy?: (value: T) => T; now?: () => number } = {},
): Memoized<T> {
  const { copy = (value: T) => value, now = Date.now } = options
  let cached: { promise: Promise<T>; expires: number } | null = null

  const memoized = (async () => {
    if (!cached || cached.expires <= now()) {
      const promise = load()
      const entry = { promise, expires: now() + ttlMs }
      cached = entry
      promise.catch(() => {
        // Never keep a failure around; let the next caller try again.
        if (cached === entry) cached = null
      })
    }
    return copy(await cached.promise)
  }) as Memoized<T>

  memoized.reset = () => {
    cached = null
  }
  return memoized
}
