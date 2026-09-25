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

describe('advance / deposit switches', () => {
  const property = { property_name: 'Casa', address: '1 Main Street' }

  it('reads a checkbox: hidden "0" then checked "1" arrives as true', () => {
    const r = propertyFormSchema.parse({
      ...property,
      require_advance: '1',
      require_deposit: '0',
    })
    expect(r.require_advance).toBe(true)
    expect(r.require_deposit).toBe(false)
  })

  it('a caller that never mentions them leaves them undefined (means: do not change)', () => {
    const r = propertyFormSchema.parse(property)
    expect(r.require_advance).toBeUndefined()
    expect(r.require_deposit).toBeUndefined()
  })

  it('accepts JSON booleans (mobile API) and ignores junk', () => {
    expect(
      roomFormSchema.parse({ require_advance: true, require_deposit: false }),
    ).toMatchObject({ require_advance: true, require_deposit: false })
    expect(
      roomFormSchema.parse({ require_advance: 'maybe' }).require_advance,
    ).toBeUndefined()
  })
})

describe('contact number (Philippine phone)', () => {
  const base = { property_name: 'Casa', address: '1 Main Street' }

  it('is optional', () => {
    expect(propertyFormSchema.parse(base).contact_number).toBeUndefined()
    expect(
      propertyFormSchema.parse({ ...base, contact_number: '   ' })
        .contact_number,
    ).toBeUndefined()
  })

  it('saves a valid number in one clean form, however it was typed', () => {
    for (const typed of [
      '0917 123 4567',
      '09171234567',
      '+639171234567',
      '9171234567',
    ]) {
      expect(
        propertyFormSchema.parse({ ...base, contact_number: typed })
          .contact_number,
      ).toBe('+63 917 123 4567')
    }
    expect(
      propertyFormSchema.parse({ ...base, contact_number: '(02) 8123 4567' })
        .contact_number,
    ).toBe('+63 2 8123 4567')
  })

  it('rejects a number that is not Philippine / not real, with a message for the field', () => {
    for (const typed of [
      '12345',
      'call me',
      '+1 415 555 2671',
      '0900 000 0000',
      '091231823478432',
    ]) {
      const r = propertyFormSchema.safeParse({ ...base, contact_number: typed })
      expect(r.success, typed).toBe(false)
      if (!r.success) {
        const issue = r.error.issues.find((i) => i.path[0] === 'contact_number')
        expect(issue?.message).toMatch(/valid Philippine number/)
      }
    }
  })
})
