import { describe, expect, it } from 'vitest'

import {
  extensionDecisionSchema,
  requestExtensionSchema,
} from '@/schemas/extension'

describe('requestExtensionSchema', () => {
  it('accepts an ISO date with an optional message', () => {
    expect(
      requestExtensionSchema.safeParse({ new_check_out: '2026-06-01' }).success,
    ).toBe(true)
    const r = requestExtensionSchema.safeParse({
      new_check_out: '2026-06-01',
      message: '  ',
    })
    expect(r.success && r.data.message).toBeUndefined()
  })

  it('rejects a non-date', () => {
    expect(
      requestExtensionSchema.safeParse({ new_check_out: 'soon' }).success,
    ).toBe(false)
  })
})

describe('extensionDecisionSchema', () => {
  it('only allows approved / rejected', () => {
    expect(extensionDecisionSchema.safeParse({ to: 'approved' }).success).toBe(
      true,
    )
    expect(extensionDecisionSchema.safeParse({ to: 'cancelled' }).success).toBe(
      false,
    )
  })
})
