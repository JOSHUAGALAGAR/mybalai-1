import { z } from 'zod'

import { optionalText } from '@/schemas/_helpers'

/** Superadmin provisions a landlord account. Listing is free: there is no plan to choose. */
export const createLandlordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ error: 'Enter a valid email.' }),
  password: z.string().min(8, { error: 'Use at least 8 characters.' }).max(72),
  full_name: z.string().trim().min(2, { error: 'Name is required.' }).max(120),
  business_name: optionalText(160),
})

export type CreateLandlordInput = z.infer<typeof createLandlordSchema>
