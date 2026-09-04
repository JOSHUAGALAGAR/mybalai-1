import { describe, expect, it } from 'vitest'

import { discoveryQuerySchema } from '@/schemas/discovery'

describe('discoveryQuerySchema', () => {
  it('fills sensible defaults for an empty query', () => {
    const q = discoveryQuerySchema.parse({})
    expect(q).toMatchObject({ sort: 'newest', page: 1, amenities: [] })
    expect(q.q).toBeUndefined()
    expect(q.type).toBeUndefined()
  })

  it('coerces and clamps values', () => {
    const q = discoveryQuerySchema.parse({
      q: '  loft  ',
      type: '3',
      min: '1000',
      max: 'abc',
      page: '0',
      sort: 'bogus',
      amenities: ['2', 'x', '5'],
    })
    expect(q.q).toBe('loft')
    expect(q.type).toBe(3)
    expect(q.min).toBe(1000)
    expect(q.max).toBeUndefined()
    expect(q.page).toBe(1)
    expect(q.sort).toBe('newest')
    expect(q.amenities).toEqual([2, 5])
  })

  it('accepts a single amenity as a string', () => {
    expect(discoveryQuerySchema.parse({ amenities: '7' }).amenities).toEqual([
      7,
    ])
  })

  it('keeps a valid sort', () => {
    expect(discoveryQuerySchema.parse({ sort: 'price_asc' }).sort).toBe(
      'price_asc',
    )
  })
})
