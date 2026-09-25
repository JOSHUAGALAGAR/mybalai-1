import { z } from 'zod'

import { parsePhPhone } from '@/lib/phone'

export const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

export function optionalText(max: number) {
  return z.preprocess(
    blankToUndefined,
    z.string().trim().min(1).max(max).optional(),
  )
}

export function optionalNumber(config: {
  min?: number
  max?: number
  int?: boolean
  message: string
}) {
  let numeric = z.coerce.number({ error: config.message })
  if (config.int) numeric = numeric.int({ error: config.message })
  if (config.min !== undefined) {
    numeric = numeric.min(config.min, { error: config.message })
  }
  if (config.max !== undefined) {
    numeric = numeric.max(config.max, { error: config.message })
  }
  return z.preprocess(blankToUndefined, numeric.optional())
}

export function requiredNumber(config: {
  min?: number
  max?: number
  int?: boolean
  message: string
}) {
  let numeric = z.coerce.number({ error: config.message })
  if (config.int) numeric = numeric.int({ error: config.message })
  if (config.min !== undefined) {
    numeric = numeric.min(config.min, { error: config.message })
  }
  if (config.max !== undefined) {
    numeric = numeric.max(config.max, { error: config.message })
  }
  return numeric
}

/**
 * A yes/no setting from a form or JSON. A checkbox is sent as a hidden "0" followed by the
 * checkbox's "1", so "unchecked" arrives as `false`; a caller that never mentions the setting
 * (e.g. the mobile API) gets `undefined`, which means "leave it as it is".
 */
export const optionalFlag = z.preprocess((value) => {
  if (value === true || value === 'true' || value === '1' || value === 'on') {
    return true
  }
  if (value === false || value === 'false' || value === '0') return false
  return undefined
}, z.boolean().optional())

/** An optional Philippine phone number, saved in one clean form ("+63 917 123 4567"). Blank = not given. */
export const optionalPhPhone = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(40)
    .transform((value, ctx) => {
      const phone = parsePhPhone(value)
      if (!phone.ok) {
        ctx.addIssue({ code: 'custom', message: phone.message })
        return z.NEVER
      }
      return phone.display
    })
    .optional(),
)
