import { describe, expect, it } from 'vitest'

import { scoreHousemates, type Lifestyle } from '@/lib/matching/compatibility'

const L = (over: Partial<Lifestyle> = {}): Lifestyle => ({
  occupation: null,
  schedule: null,
  noise: null,
  ...over,
})

describe('scoreHousemates', () => {
  it('has nothing to say when nobody shared, or the newcomer answered nothing', () => {
    const none = scoreHousemates(L({ noise: 'quiet' }), [], 2)
    expect(none).toMatchObject({
      score: null,
      verdict: 'unknown',
      housemates: 2,
    })
    expect(scoreHousemates(L(), [L({ noise: 'quiet' })], 1).score).toBeNull()
  })

  it('scores identical lifestyles as a good match with reasons', () => {
    const me = L({ occupation: 'student', schedule: 'day', noise: 'quiet' })
    const r = scoreHousemates(me, [me], 1)
    expect(r.score).toBe(100)
    expect(r.verdict).toBe('good')
    expect(r.reasons).toContain('Both prefer a quiet home')
    expect(r.concerns).toEqual([])
  })

  it('flags a day/night clash and a quiet/social gap', () => {
    const r = scoreHousemates(
      L({ schedule: 'day', noise: 'quiet' }),
      [L({ schedule: 'night', noise: 'social' })],
      1,
    )
    expect(r.score).toBe(0)
    expect(r.verdict).toBe('poor')
    expect(r.concerns).toHaveLength(2)
  })

  it('treats a changing schedule as a partial fit and re-normalises missing answers', () => {
    const r = scoreHousemates(
      L({ schedule: 'mixed' }),
      [L({ schedule: 'day' })],
      1,
    )
    expect(r.score).toBe(60)
    expect(r.verdict).toBe('fair')
  })

  it('lets one clashing housemate pull the score down', () => {
    const me = L({ schedule: 'day', noise: 'quiet' })
    const good = L({ schedule: 'day', noise: 'quiet' })
    const bad = L({ schedule: 'night', noise: 'social' })
    const both = scoreHousemates(me, [good, bad], 2)
    // mean 50, worst 0 -> 30, lower than the plain average
    expect(both.score).toBe(30)
    expect(scoreHousemates(me, [good, good], 2).score).toBe(100)
  })

  it('counts only the people who shared, but reports everyone in the room', () => {
    const r = scoreHousemates(L({ noise: 'quiet' }), [L({ noise: 'quiet' })], 3)
    expect(r).toMatchObject({ compared: 1, housemates: 3 })
  })
})
