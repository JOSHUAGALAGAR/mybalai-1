import { describe, expect, it } from 'vitest'

import {
  assignSubscriptionSchema,
  createLandlordSchema,
  planFormSchema,
} from '@/schemas/subscription'

const basePlan = {
  code: 'Standard',
  name: 'Standard',
  max_properties: '10',
  max_rooms_per_property: '20',
  max_beds_per_room: '6',
  max_caretakers: '3',
  price: '499',
  billing_interval_days: '30',
}

describe('planFormSchema', () => {
  it('lowercases the code and coerces caps to ints', () => {
    const r = planFormSchema.safeParse({ ...basePlan, is_active: 'on' })
    expect(r.success && r.data.code).toBe('standard')
    expect(r.success && r.data.max_properties).toBe(10)
    expect(r.success && r.data.is_active).toBe(true)
  })

  it('treats a missing is_active as false', () => {
    const r = planFormSchema.safeParse(basePlan)
    expect(r.success && r.data.is_active).toBe(false)
  })

  it('rejects a code with spaces and a negative cap', () => {
    expect(
      planFormSchema.safeParse({ ...basePlan, code: 'two words' }).success,
    ).toBe(false)
    expect(
      planFormSchema.safeParse({ ...basePlan, max_properties: '-1' }).success,
    ).toBe(false)
  })

  it('parses price and billing interval', () => {
    const r = planFormSchema.safeParse({ ...basePlan, is_active: 'on' })
    expect(r.success && r.data.price).toBe(499)
    expect(r.success && r.data.billing_interval_days).toBe(30)
  })
})

describe('assignSubscriptionSchema', () => {
  it('accepts a valid assignment', () => {
    const r = assignSubscriptionSchema.safeParse({
      landlord_id: '1000002',
      plan_id: '2',
      status: 'active',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown status', () => {
    expect(
      assignSubscriptionSchema.safeParse({
        landlord_id: '1',
        plan_id: '1',
        status: 'paused',
      }).success,
    ).toBe(false)
  })
})

describe('createLandlordSchema', () => {
  it('requires an 8+ char password and a valid email', () => {
    expect(
      createLandlordSchema.safeParse({
        email: 'l@example.com',
        password: 'longenough',
        full_name: 'Lara',
      }).success,
    ).toBe(true)
    expect(
      createLandlordSchema.safeParse({
        email: 'nope',
        password: 'x',
        full_name: 'Lara',
      }).success,
    ).toBe(false)
  })

  it('leaves plan_id optional', () => {
    const r = createLandlordSchema.safeParse({
      email: 'l@example.com',
      password: 'longenough',
      full_name: 'Lara',
    })
    expect(r.success && r.data.plan_id).toBeUndefined()
  })
})
