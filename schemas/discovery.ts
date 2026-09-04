import { z } from 'zod'

export const DISCOVERY_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name',
] as const
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number]

export const PAGE_SIZE = 12

const toArray = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value]

/** Parses/normalises the `/discover` querystring. Everything is optional. */
export const discoveryQuerySchema = z.object({
  q: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : undefined),
    z.string().min(1).optional(),
  ),
  type: z.preprocess((v) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 ? n : undefined
  }, z.number().int().positive().optional()),
  min: z.preprocess((v) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }, z.number().nonnegative().optional()),
  max: z.preprocess((v) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }, z.number().nonnegative().optional()),
  amenities: z.preprocess(
    (v) =>
      toArray(v)
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 30),
    z.array(z.number().int().positive()).default([]),
  ),
  sort: z.preprocess(
    (v) =>
      typeof v === 'string' &&
      (DISCOVERY_SORTS as readonly string[]).includes(v)
        ? v
        : 'newest',
    z.enum(DISCOVERY_SORTS),
  ),
  page: z.preprocess((v) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 ? Math.min(n, 1000) : 1
  }, z.number().int().positive()),
})

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>
