import { describe, expect, it } from 'vitest'

import {
  adStatus,
  endOfManilaDay,
  isAdImagePath,
  manilaDay,
  startOfManilaDay,
} from '@/lib/ads/rules'
import { safeBackTo } from '@/lib/navigation/back-to'
import { adFormSchema } from '@/schemas/ads'

const now = new Date('2026-09-25T04:00:00Z')

describe('adStatus', () => {
  const base = { is_active: true, starts_at: null, ends_at: null }
  it('is live with no window', () => expect(adStatus(base, now)).toBe('live'))
  it('is paused when switched off, even inside its window', () => {
    expect(adStatus({ ...base, is_active: false }, now)).toBe('paused')
  })
  it('is scheduled before it starts and ended after it ends', () => {
    expect(adStatus({ ...base, starts_at: '2026-10-01T00:00:00Z' }, now)).toBe(
      'scheduled',
    )
    expect(adStatus({ ...base, ends_at: '2026-09-01T00:00:00Z' }, now)).toBe(
      'ended',
    )
    expect(adStatus({ ...base, ends_at: '2026-09-25T04:00:00Z' }, now)).toBe(
      'ended',
    )
  })
})

describe('Manila days', () => {
  it('turns a picked day into Manila start / end instants and back', () => {
    expect(startOfManilaDay('2026-09-30')).toBe('2026-09-29T16:00:00.000Z')
    expect(endOfManilaDay('2026-09-30')).toBe('2026-09-30T15:59:59.999Z')
    expect(manilaDay('2026-09-29T16:00:00.000Z')).toBe('2026-09-30')
    expect(manilaDay(null)).toBe('')
  })
})

describe('isAdImagePath', () => {
  it('accepts only server-issued names', () => {
    expect(isAdImagePath('ads/123e4567-e89b-12d3-a456-426614174000.png')).toBe(
      true,
    )
    expect(isAdImagePath('ads/../secret.png')).toBe(false)
    expect(
      isAdImagePath('avatars/123e4567-e89b-12d3-a456-426614174000.png'),
    ).toBe(false)
    expect(isAdImagePath('ads/123e4567-e89b-12d3-a456-426614174000.svg')).toBe(
      false,
    )
  })
})

describe('adFormSchema', () => {
  const ok = { title: 'Sale', target_roles: ['tenant'], is_active: 'true' }

  it('accepts a minimal ad and treats empty optional fields as absent', () => {
    const d = adFormSchema.parse({
      ...ok,
      body: '',
      link_url: '',
      starts_on: '',
      ends_on: '',
    })
    expect(d.body).toBeUndefined()
    expect(d.link_url).toBeUndefined()
    expect(d.is_active).toBe(true)
  })

  it('accepts a single checkbox as a string', () => {
    expect(
      adFormSchema.parse({ ...ok, target_roles: 'landlord' }).target_roles,
    ).toEqual(['landlord'])
  })

  it('needs at least one audience and a real http(s) link', () => {
    expect(adFormSchema.safeParse({ ...ok, target_roles: [] }).success).toBe(
      false,
    )
    expect(
      adFormSchema.safeParse({ ...ok, target_roles: ['admin'] }).success,
    ).toBe(false)
    expect(
      adFormSchema.safeParse({ ...ok, link_url: 'javascript:alert(1)' })
        .success,
    ).toBe(false)
    expect(
      adFormSchema.safeParse({ ...ok, link_url: 'https://example.com/x' })
        .success,
    ).toBe(true)
  })

  it('rejects an end date before the start date', () => {
    expect(
      adFormSchema.safeParse({
        ...ok,
        starts_on: '2026-10-05',
        ends_on: '2026-10-01',
      }).success,
    ).toBe(false)
    expect(
      adFormSchema.safeParse({
        ...ok,
        starts_on: '2026-10-01',
        ends_on: '2026-10-01',
      }).success,
    ).toBe(true)
  })

  it('unticked "active" means paused', () => {
    expect(
      adFormSchema.parse({ title: 'Sale', target_roles: ['tenant'] }).is_active,
    ).toBe(false)
  })
})

describe('safeBackTo', () => {
  it('only allows known list pages', () => {
    expect(safeBackTo('/admin/bookings', '/landlord/bookings')).toBe(
      '/admin/bookings',
    )
    expect(safeBackTo('//evil.com', '/landlord/bookings')).toBe(
      '/landlord/bookings',
    )
    expect(safeBackTo('https://evil.com', '/landlord/payments')).toBe(
      '/landlord/payments',
    )
    expect(safeBackTo(null, '/landlord/payments')).toBe('/landlord/payments')
  })
})

import { changePasswordSchema } from '@/schemas/auth'

describe('changePasswordSchema', () => {
  const ok = {
    currentPassword: 'old-pass-1',
    password: 'new-pass-22',
    confirmPassword: 'new-pass-22',
  }
  it('accepts a proper change', () =>
    expect(changePasswordSchema.safeParse(ok).success).toBe(true))
  it('needs matching, long-enough, different passwords', () => {
    expect(
      changePasswordSchema.safeParse({ ...ok, confirmPassword: 'nope' })
        .success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        ...ok,
        password: 'short',
        confirmPassword: 'short',
      }).success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        ...ok,
        password: 'old-pass-1',
        confirmPassword: 'old-pass-1',
      }).success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({ ...ok, currentPassword: '' }).success,
    ).toBe(false)
  })
})
