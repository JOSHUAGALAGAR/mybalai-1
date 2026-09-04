import { z } from 'zod'

import {
  blankToUndefined,
  optionalText,
  requiredNumber,
} from '@/schemas/_helpers'

export const SUBSCRIPTION_STATUSES = [
  'active',
  'suspended',
  'cancelled',
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

const cap = (message: string) =>
  requiredNumber({ int: true, min: 0, max: 100000, message })

/** Superadmin creates / edits a plan in the catalog. */
export const planFormSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, { error: 'Code is required.' })
    .max(40)
    .regex(/^[a-z0-9_-]+$/, {
      error: 'Use lowercase letters, numbers, - or _.',
    }),
  name: z.string().trim().min(2, { error: 'Name is required.' }).max(80),
  description: optionalText(500),
  max_properties: cap('Enter a whole number (0 or more).'),
  max_rooms_per_property: cap('Enter a whole number (0 or more).'),
  max_beds_per_room: cap('Enter a whole number (0 or more).'),
  max_caretakers: cap('Enter a whole number (0 or more).'),
  price: requiredNumber({
    min: 0,
    max: 1_000_000,
    message: 'Enter the price in PHP (0 for a free plan).',
  }),
  billing_interval_days: requiredNumber({
    int: true,
    min: 1,
    max: 3650,
    message: 'Enter the billing interval in days.',
  }),
  is_active: z.preprocess(
    (v) => v === 'on' || v === 'true' || v === true,
    z.boolean(),
  ),
  sort_order: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(9999).optional(),
  ),
})

export type PlanFormInput = z.infer<typeof planFormSchema>

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use the date picker.' })

/** Superadmin assigns / updates a landlord's subscription. */
export const assignSubscriptionSchema = z.object({
  landlord_id: z.coerce
    .number()
    .int()
    .positive({ error: 'Choose a landlord.' }),
  plan_id: z.coerce.number().int().positive({ error: 'Choose a plan.' }),
  status: z.enum(SUBSCRIPTION_STATUSES, { error: 'Choose a status.' }),
  ends_at: z.preprocess(blankToUndefined, isoDate.optional()),
  note: optionalText(500),
})

export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionSchema>

/** Superadmin provisions a landlord account (optionally with a plan). */
export const createLandlordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ error: 'Enter a valid email.' }),
  password: z.string().min(8, { error: 'Use at least 8 characters.' }).max(72),
  full_name: z.string().trim().min(2, { error: 'Name is required.' }).max(120),
  business_name: optionalText(160),
  plan_id: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
})

export type CreateLandlordInput = z.infer<typeof createLandlordSchema>
