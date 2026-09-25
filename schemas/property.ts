import { z } from 'zod'

import {
  blankToUndefined,
  optionalNumber,
  optionalFlag,
  optionalPhPhone,
  optionalText,
} from '@/schemas/_helpers'

/** Statuses a landlord may set on their own property (superadmin is not limited). */
export const OWNER_PROPERTY_STATUSES = [
  'active',
  'inactive',
  'maintenance',
] as const
export type OwnerPropertyStatus = (typeof OWNER_PROPERTY_STATUSES)[number]

/** Every new property starts here (awaiting superadmin approval). */
export const DEFAULT_NEW_PROPERTY_STATUS = 'pending'

export const propertyFormSchema = z.object({
  property_name: z
    .string()
    .trim()
    .min(2, { error: 'Property name is required.' })
    .max(200, { error: 'Property name is too long.' }),
  address: z
    .string()
    .trim()
    .min(5, { error: 'Address is required.' })
    .max(500, { error: 'Address is too long.' }),
  property_type_id: optionalNumber({
    int: true,
    min: 1,
    message: 'Select a valid property type.',
  }),
  status_code: z.preprocess(
    blankToUndefined,
    z.enum([...OWNER_PROPERTY_STATUSES]).optional(),
  ),
  monthly_payment_rule: optionalText(200),
  booking_policy: optionalText(2000),
  description: optionalText(4000),
  house_rules: optionalText(4000),
  contact_number: optionalPhPhone,
  property_image: z.preprocess(
    blankToUndefined,
    z.url({ error: 'Enter a valid image URL.' }).max(1000).optional(),
  ),
  latitude: optionalNumber({
    min: -90,
    max: 90,
    message: 'Latitude must be between -90 and 90.',
  }),
  longitude: optionalNumber({
    min: -180,
    max: 180,
    message: 'Longitude must be between -180 and 180.',
  }),
  google_place_id: optionalText(255),
  require_advance: optionalFlag,
  require_deposit: optionalFlag,
})

export type PropertyFormInput = z.infer<typeof propertyFormSchema>

export const amenitiesFormSchema = z.object({
  amenity_ids: z.array(z.coerce.number().int().positive()).max(100).default([]),
})
