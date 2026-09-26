import { z } from 'zod'

/** The superadmin's boost package (what a boost costs). PayMongo's minimum charge is ₱20. */
export const boostPackageSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Enter a name (at least 2 characters).' })
    .max(80),
  days: z.coerce
    .number({ error: 'Enter the number of days.' })
    .int({ error: 'Enter a whole number of days.' })
    .min(1, { error: 'At least 1 day.' })
    .max(365, { error: 'At most 365 days.' }),
  price: z.coerce
    .number({ error: 'Enter the price in pesos.' })
    .min(20, { error: 'The minimum price is ₱20 (PayMongo’s minimum).' })
    .max(1_000_000, { error: 'That price is too high.' }),
  is_active: z.preprocess(
    (v) => v === 'on' || v === 'true' || v === true,
    z.boolean(),
  ),
})

/** A landlord buying a boost. */
export const buyBoostSchema = z.object({
  property_id: z.coerce
    .number()
    .int()
    .positive({ error: 'Choose a property.' }),
  package_id: z.coerce.number().int().positive({ error: 'Choose a boost.' }),
})
