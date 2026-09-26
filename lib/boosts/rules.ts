/** Property-boost rules. Pure (no I/O): used by the server, the pages and the tests. */

export type BoostStatus = 'pending' | 'active' | 'expired' | 'cancelled'

/** A boost counts only while it is paid ("active") and its time has not run out. */
export function isBoostLive(
  boost: { status: string; ends_at: string | null; starts_at?: string | null },
  now: Date,
): boolean {
  if (boost.status !== 'active' || !boost.ends_at) return false
  if (boost.starts_at && new Date(boost.starts_at) > now) return false // queued behind another boost
  return new Date(boost.ends_at) > now
}

/** "Boosted until 12 Oct" / "Starts 12 Oct" / "Ended" — what the landlord reads next to a boost. */
export function boostState(
  boost: { status: string; starts_at: string | null; ends_at: string | null },
  now: Date,
): 'live' | 'queued' | 'ended' | 'waiting_payment' | 'cancelled' {
  if (boost.status === 'cancelled') return 'cancelled'
  if (boost.status === 'pending') return 'waiting_payment'
  if (!boost.ends_at || new Date(boost.ends_at) <= now) return 'ended'
  if (boost.starts_at && new Date(boost.starts_at) > now) return 'queued'
  return 'live'
}

/** Whole days left, rounded up (a boost with 3 hours left has "1 day left"). */
export function daysLeft(endsAt: string, now: Date): number {
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 86_400_000),
  )
}
