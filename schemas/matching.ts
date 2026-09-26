import { z } from 'zod'

const money = (label: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce
      .number({ error: `${label} must be a number.` })
      .min(0, { error: `${label} cannot be negative.` })
      .max(1_000_000, { error: `${label} is too high.` })
      .nullable(),
  )

const opt = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.enum(values).nullable(),
  )

/** What a tenant is looking for. Every field is optional: matching uses only what was answered. */
export const tenantPreferencesSchema = z
  .object({
    budget_min: money('The minimum budget'),
    budget_max: money('The maximum budget'),
    area_label: z.preprocess(
      (v) =>
        v === undefined || (typeof v === 'string' && v.trim() === '')
          ? null
          : v,
      z.string().trim().max(300).nullable(),
    ),
    area_lat: z.number().min(-90).max(90).nullable().default(null),
    area_lng: z.number().min(-180).max(180).nullable().default(null),
    max_distance_km: z.coerce
      .number({ error: 'Enter how far you are willing to travel.' })
      .min(0.5, { error: 'At least 0.5 km.' })
      .max(100, { error: 'At most 100 km.' })
      .default(3),
    amenity_ids: z
      .array(z.number().int().positive())
      .max(50, { error: 'Pick up to 50 amenities.' })
      .default([]),
    room_type_ids: z
      .array(z.number().int().positive())
      .max(20, { error: 'Pick up to 20 room types.' })
      .default([]),
    move_in: z
      .enum(['this_month', 'next_month', 'flexible'])
      .default('flexible'),
    occupation: opt(['student', 'working', 'other']),
    schedule: opt(['day', 'night', 'mixed']),
    noise: opt(['quiet', 'balanced', 'social']),
    share_lifestyle: z.boolean().default(false),
  })
  .refine(
    (d) =>
      d.budget_min === null ||
      d.budget_max === null ||
      d.budget_min <= d.budget_max,
    {
      error: 'The minimum cannot be more than the maximum.',
      path: ['budget_min'],
    },
  )
  .refine((d) => (d.area_lat === null) === (d.area_lng === null), {
    error: 'Choose the area from the map or the suggestions.',
    path: ['area_label'],
  })

export type TenantPreferencesInput = z.infer<typeof tenantPreferencesSchema>
