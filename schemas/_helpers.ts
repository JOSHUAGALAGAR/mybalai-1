import { z } from 'zod'

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
