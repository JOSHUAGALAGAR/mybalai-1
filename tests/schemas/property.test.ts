import { describe, expect, it } from 'vitest'

import { bedFormSchema } from '@/schemas/bed'
import { propertyFormSchema } from '@/schemas/property'
import { rentalRateFormSchema } from '@/schemas/rental-rate'
import { roomFormSchema } from '@/schemas/room'

describe('propertyFormSchema', () => {
  const ok = { property_name: 'Sunrise Dorm', address: '12 Rizal St, Uno' }

  it('accepts a minimal property', () => {
    expect(propertyFormSchema.safeParse(ok).success).toBe(true)
  })
  it('blanks optional fields to undefined', () => {
    const r = propertyFormSchema.safeParse({
      ...ok,
      latitude: '',
      description: '  ',
    })
    expect(r.success && r.data.latitude).toBeUndefined()
    expect(r.success && r.data.description).toBeUndefined()
  })
  it('rejects a missing name and an out-of-range latitude', () => {
    expect(propertyFormSchema.safeParse({ address: ok.address }).success).toBe(
      false,
    )
    expect(
      propertyFormSchema.safeParse({ ...ok, latitude: '200' }).success,
    ).toBe(false)
  })
  it('rejects a non-URL cover image', () => {
    expect(
      propertyFormSchema.safeParse({ ...ok, property_image: 'not a url' })
        .success,
    ).toBe(false)
    expect(
      propertyFormSchema.safeParse({
        ...ok,
        property_image: 'https://x.test/a.jpg',
      }).success,
    ).toBe(true)
  })
})

describe('roomFormSchema', () => {
  it('defaults max_occupants to 1 and accepts empties', () => {
    const r = roomFormSchema.safeParse({})
    expect(r.success && r.data.max_occupants).toBe(1)
  })
  it('rejects max_occupants below 1', () => {
    expect(roomFormSchema.safeParse({ max_occupants: '0' }).success).toBe(false)
  })
})

describe('bedFormSchema', () => {
  it('requires a bed number, defaults status to available', () => {
    const r = bedFormSchema.safeParse({ bed_number: 'A1' })
    expect(r.success && r.data.status_code).toBe('available')
    expect(bedFormSchema.safeParse({ bed_number: '' }).success).toBe(false)
  })
})

describe('rentalRateFormSchema', () => {
  const base = {
    room_id: '5',
    period: 'monthly',
    price: '8000',
    valid_from: '2026-01-01',
  }
  it('accepts a valid rate', () => {
    expect(rentalRateFormSchema.safeParse(base).success).toBe(true)
  })
  it('rejects valid_until before valid_from', () => {
    const r = rentalRateFormSchema.safeParse({
      ...base,
      valid_until: '2025-06-01',
    })
    expect(r.success).toBe(false)
  })
  it('rejects a negative price and a missing room', () => {
    expect(
      rentalRateFormSchema.safeParse({ ...base, price: '-1' }).success,
    ).toBe(false)
    expect(
      rentalRateFormSchema.safeParse({ ...base, room_id: '0' }).success,
    ).toBe(false)
  })
})
