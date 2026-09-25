/** Pure readers for a Supabase access token's claims (no I/O — unit tested). */

/** The ways this session was authenticated (`password`, `oauth`, `otp`, …) from the token's `amr` claim. */
export function authMethodsFromClaims(
  claims: { amr?: unknown } | null | undefined,
): string[] {
  const amr = claims?.amr
  if (!Array.isArray(amr)) return []
  return amr
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : (entry as { method?: unknown } | null)?.method,
    )
    .filter((m): m is string => typeof m === 'string')
}

/** When (unix seconds) a given sign-in method was last used, according to the token's `amr` claim. */
export function lastAuthTimestamp(
  claims: { amr?: unknown } | null | undefined,
  method: string,
): number | null {
  const amr = claims?.amr
  if (!Array.isArray(amr)) return null
  const times = amr
    .filter(
      (entry): entry is { method: string; timestamp: number } =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { method?: unknown }).method === method &&
        typeof (entry as { timestamp?: unknown }).timestamp === 'number',
    )
    .map((entry) => entry.timestamp)
  return times.length > 0 ? Math.max(...times) : null
}
