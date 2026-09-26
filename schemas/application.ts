import { z } from 'zod'

import { parsePhPhone } from '@/lib/phone'

const blankToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v

/** What a property owner fills in on the public "List your property" form. */
export const landlordApplicationSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, { error: 'Enter your full name.' })
    .max(120, { error: 'That name is too long.' }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ error: 'Enter a valid email address.' })
    .max(200),
  phone: z
    .string()
    .trim()
    .min(1, { error: 'Enter a phone number we can reach you on.' })
    .max(40)
    .transform((value, ctx) => {
      const phone = parsePhPhone(value)
      if (!phone.ok) {
        ctx.addIssue({ code: 'custom', message: phone.message })
        return z.NEVER
      }
      return phone.display
    }),
  business_name: z.preprocess(
    blankToUndef,
    z.string().trim().max(160).optional(),
  ),
  property_name: z
    .string()
    .trim()
    .min(2, { error: 'Enter the name of your property.' })
    .max(200),
  address: z
    .string()
    .trim()
    .min(5, { error: 'Enter the property’s address.' })
    .max(300),
  rooms_count: z.coerce
    .number({ error: 'Enter how many rooms you have.' })
    .int({ error: 'Enter a whole number of rooms.' })
    .min(1, { error: 'You need at least 1 room.' })
    .max(1000, {
      error: 'That is a lot of rooms — enter a number up to 1000.',
    }),
  description: z.preprocess(
    blankToUndef,
    z
      .string()
      .trim()
      .max(2000, { error: 'Keep it under 2000 characters.' })
      .optional(),
  ),
})

export type LandlordApplicationInput = z.infer<typeof landlordApplicationSchema>

export const rejectApplicationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, { error: 'Say why (at least 5 characters).' })
    .max(500, { error: 'Keep it under 500 characters.' }),
})
