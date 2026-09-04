import { z } from 'zod'

export const BED_STATUSES = [
  'available',
  'occupied',
  'reserved',
  'maintenance',
  'inactive',
] as const
export type BedStatus = (typeof BED_STATUSES)[number]

export const DEFAULT_BED_STATUS = 'available'

export const bedFormSchema = z.object({
  bed_number: z
    .string()
    .trim()
    .min(1, { error: 'Bed number is required.' })
    .max(40, { error: 'Bed number is too long.' }),
  status_code: z.enum([...BED_STATUSES]).default(DEFAULT_BED_STATUS),
})

export type BedFormInput = z.infer<typeof bedFormSchema>

export const bedStatusSchema = z.object({
  status_code: z.enum([...BED_STATUSES]),
})
