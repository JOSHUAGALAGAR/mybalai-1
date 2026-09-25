import { describe, expect, it } from 'vitest'

import { parsePhPhone, PH_PHONE_MESSAGE } from '@/lib/phone'

const good = (input: string) => {
  const r = parsePhPhone(input)
  if (!r.ok) throw new Error(`expected ${input} to be valid`)
  return r
}

describe('parsePhPhone — accepts real Philippine numbers in the ways people type them', () => {
  it.each([
    '0917 123 4567',
    '09171234567',
    '0917-123-4567',
    '+63 917 123 4567',
    '+639171234567',
    '63917-123-4567',
    '9171234567',
    '  0917 123 4567  ',
    '(0917) 123 4567',
  ])('mobile: %s', (input) => {
    const r = good(input)
    expect(r.kind).toBe('mobile')
    expect(r.display).toBe('+63 917 123 4567')
    expect(r.e164).toBe('+639171234567')
  })

  it.each([
    ['(02) 8123 4567', '+63 2 8123 4567'],
    ['02-8123-4567', '+63 2 8123 4567'],
    ['+63 2 8123 4567', '+63 2 8123 4567'],
    ['032 234 5678', '+63 32 234 5678'],
    ['(088) 856 1234', '+63 88 856 1234'],
  ])('landline with area code: %s', (input, display) => {
    const r = good(input)
    expect(r.kind).toBe('landline')
    expect(r.display).toBe(display)
  })
})

describe('parsePhPhone — refuses everything else with one helpful message', () => {
  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['words', 'call me'],
    ['vanity letters', '0917-CALL-NOW'],
    ['too short', '12345'],
    ['a digit short', '0917 123 456'],
    ['a digit long', '0917 123 45678'],
    ['not a real prefix', '0900 000 0000'],
    ['bad area code', '02 1234 5678'],
    ['a number from another country', '+1 415 555 2671'],
    ['another country, Singapore', '+65 6123 4567'],
    ['the fake one already in the data', '091231823478432'],
    ['toll-free (not a contact line)', '1800 10 123 4567'],
    ['stray symbols', '0917 123 4567 #'],
    ['way too long', '0'.repeat(31)],
  ])('%s', (_name, input) => {
    expect(parsePhPhone(input)).toEqual({
      ok: false,
      message: PH_PHONE_MESSAGE,
    })
  })

  it('the message shows what a good number looks like', () => {
    expect(PH_PHONE_MESSAGE).toContain('0917 123 4567')
    expect(PH_PHONE_MESSAGE).toContain('(02) 8123 4567')
  })
})
