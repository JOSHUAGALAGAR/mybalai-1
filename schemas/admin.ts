import { z } from 'zod'

/** Property statuses the superadmin may set from the review console. */
export const ADMIN_PROPERTY_STATUSES = [
  'active',
  'inactive',
  'pending',
  'maintenance',
  'archived',
] as const
export type AdminPropertyStatus = (typeof ADMIN_PROPERTY_STATUSES)[number]

export const setPropertyStatusSchema = z.object({
  status_code: z.enum(ADMIN_PROPERTY_STATUSES, {
    error: 'Choose a valid status.',
  }),
})

const boolFlag = z.preprocess(
  (v) => v === 'true' || v === 'on' || v === true || v === '1',
  z.boolean(),
)

export const setPropertyFlagsSchema = z.object({
  is_verified: boolFlag,
  is_featured: boolFlag,
})

export const setUserActiveSchema = z.object({
  is_active: z.preprocess(
    (v) => v === 'true' || v === true || v === '1',
    z.boolean(),
  ),
})
