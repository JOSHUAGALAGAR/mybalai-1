/**
 * Housemate compatibility — the landlord-side half of matching.
 *
 * When a tenant asks for a bed in a shared room, this compares their (opt-in) lifestyle answers
 * with those of the people who will be in that room on the same dates. Pure and deterministic:
 * the same answers always give the same score, and every score comes with plain-language reasons.
 *
 * Only people who chose to share their answers take part; nobody's raw answers are returned,
 * only how well they line up.
 */

export type Occupation = 'student' | 'working' | 'other'
export type Schedule = 'day' | 'night' | 'mixed'
export type Noise = 'quiet' | 'balanced' | 'social'

export type Lifestyle = {
  occupation: Occupation | null
  schedule: Schedule | null
  noise: Noise | null
}

export type Compatibility = {
  /** 0–100, or null when there is nothing to compare (nobody in the room shared their answers). */
  score: number | null
  verdict: 'good' | 'fair' | 'poor' | 'unknown'
  reasons: string[]
  concerns: string[]
  /** How many housemates were compared / how many are in the room in total. */
  compared: number
  housemates: number
}

/** How much each answer matters when two people share a room. Sleep times matter most. */
export const WEIGHTS = { schedule: 45, noise: 40, occupation: 15 } as const

const NOISE_LEVEL: Record<Noise, number> = { quiet: 0, balanced: 1, social: 2 }

type Pair = { score: number; reasons: string[]; concerns: string[] }

/** One pair of people; only answers both gave count, and the weights are re-normalised. */
function comparePair(a: Lifestyle, b: Lifestyle): Pair | null {
  let earned = 0
  let possible = 0
  const reasons: string[] = []
  const concerns: string[] = []

  if (a.schedule && b.schedule) {
    possible += WEIGHTS.schedule
    if (a.schedule === b.schedule) {
      earned += WEIGHTS.schedule
      reasons.push(
        a.schedule === 'mixed'
          ? 'Both have changing schedules'
          : `Both keep ${a.schedule === 'day' ? 'daytime' : 'night-shift'} hours`,
      )
    } else if (a.schedule === 'mixed' || b.schedule === 'mixed') {
      earned += WEIGHTS.schedule * 0.6
    } else {
      concerns.push('One works days and the other nights — sleep may clash')
    }
  }

  if (a.noise && b.noise) {
    possible += WEIGHTS.noise
    const gap = Math.abs(NOISE_LEVEL[a.noise] - NOISE_LEVEL[b.noise])
    earned += WEIGHTS.noise * (1 - gap * 0.5)
    if (gap === 0) reasons.push(`Both prefer a ${a.noise} home`)
    else if (gap === 2) concerns.push('One likes it quiet, the other social')
  }

  if (a.occupation && b.occupation) {
    possible += WEIGHTS.occupation
    if (a.occupation === b.occupation) {
      earned += WEIGHTS.occupation
      reasons.push(
        a.occupation === 'student'
          ? 'Both are students'
          : a.occupation === 'working'
            ? 'Both are working'
            : 'Similar day-to-day',
      )
    } else earned += WEIGHTS.occupation * 0.5
  }

  return possible === 0
    ? null
    : { score: (earned / possible) * 100, reasons, concerns }
}

const verdictFor = (score: number): Compatibility['verdict'] =>
  score >= 75 ? 'good' : score >= 50 ? 'fair' : 'poor'

/**
 * @param newcomer the tenant asking for a bed (their answers, or all-null if they did not share)
 * @param housemates the answers of people already in the room, one entry per person; entries of
 *   people who did not share should be left out of `sharing` but counted in `totalHousemates`
 */
export function scoreHousemates(
  newcomer: Lifestyle,
  sharing: Lifestyle[],
  totalHousemates: number,
): Compatibility {
  const pairs = sharing
    .map((h) => comparePair(newcomer, h))
    .filter((p): p is Pair => p !== null)

  if (pairs.length === 0) {
    return {
      score: null,
      verdict: 'unknown',
      reasons: [],
      concerns: [],
      compared: 0,
      housemates: totalHousemates,
    }
  }

  // The weakest match matters as much as the average: one clashing housemate spoils a room.
  const mean = pairs.reduce((s, p) => s + p.score, 0) / pairs.length
  const worst = Math.min(...pairs.map((p) => p.score))
  const score = Math.round(mean * 0.6 + worst * 0.4)

  const unique = (xs: string[]) => [...new Set(xs)]
  return {
    score,
    verdict: verdictFor(score),
    reasons: unique(pairs.flatMap((p) => p.reasons)),
    concerns: unique(pairs.flatMap((p) => p.concerns)),
    compared: pairs.length,
    housemates: totalHousemates,
  }
}
