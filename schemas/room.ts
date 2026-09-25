import { z } from 'zod'

import {
  blankToUndefined,
  optionalNumber,
  optionalFlag,
  optionalText,
} from '@/schemas/_helpers'

export const ROOM_STATUSES = [
  'available',
  'occupied',
  'reserved',
  'maintenance',
  'inactive',
] as const
export type RoomStatus = (typeof ROOM_STATUSES)[number]

export const DEFAULT_ROOM_STATUS = 'available'

export const roomFormSchema = z.object({
  room_number: optionalText(40),
  room_name: optionalText(120),
  room_type_id: optionalNumber({
    int: true,
    min: 1,
    message: 'Select a valid room type.',
  }),
  status_code: z.preprocess(
    blankToUndefined,
    z.enum([...ROOM_STATUSES]).optional(),
  ),
  floor: optionalText(40),
  area_sqm: optionalNumber({
    min: 0,
    max: 100000,
    message: 'Area must be 0 or more.',
  }),
  max_occupants: z.coerce
    .number({ error: 'Max occupants must be a whole number.' })
    .int({ error: 'Max occupants must be a whole number.' })
    .min(1, { error: 'Max occupants must be at least 1.' })
    .max(50, { error: 'Max occupants is too high.' })
    .default(1),
  description: optionalText(4000),
  require_advance: optionalFlag,
  require_deposit: optionalFlag,
  room_image: z.preprocess(
    blankToUndefined,
    z.url({ error: 'Enter a valid image URL.' }).max(1000).optional(),
  ),
})

export type RoomFormInput = z.infer<typeof roomFormSchema>

/** Just the two switches — used to flip them without resending the whole room. */
export const roomRequirementsSchema = z.object({
  require_advance: z.boolean({ error: 'Choose yes or no.' }),
  require_deposit: z.boolean({ error: 'Choose yes or no.' }),
})
