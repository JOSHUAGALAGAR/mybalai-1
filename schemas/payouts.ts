import { z } from 'zod'

import { WITHDRAWAL_METHODS } from '@/lib/payouts/rules'

const pct = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .min(0, { error: `${label} cannot be negative.` })
    .max(50, { error: `${label} cannot be more than 50%.` })

/** The superadmin's payout & fee settings. */
export const payoutSettingsSchema = z.object({
  paymongo_fee_rate: pct('PayMongo fee'),
  platform_fee_rate: pct('MyBalai fee'),
  withdrawal_day: z.coerce
    .number({ error: 'Choose a day of the month.' })
    .int({ error: 'Choose a day of the month.' })
    .min(1, { error: 'Choose a day from 1 to 31.' })
    .max(31, { error: 'Choose a day from 1 to 31.' }),
  minimum_threshold: z.coerce
    .number({ error: 'Enter the minimum amount.' })
    .min(0, { error: 'The minimum cannot be negative.' })
    .max(10_000_000, { error: 'That minimum is too high.' }),
  hold_days: z.coerce
    .number({ error: 'Enter a number of days.' })
    .int({ error: 'Enter a whole number of days.' })
    .min(0, { error: 'Days cannot be negative.' })
    .max(30, { error: 'Hold for at most 30 days.' }),
})

/** Where a landlord wants their money sent. */
export const withdrawalMethodSchema = z.object({
  method_type: z.enum(
    WITHDRAWAL_METHODS.map((m) => m.code) as [string, ...string[]],
    { error: 'Choose GCash, Maya or a bank account.' },
  ),
  account_name: z
    .string()
    .trim()
    .min(2, { error: 'Enter the account holder’s name.' })
    .max(120),
  account_number: z
    .string()
    .trim()
    .regex(/^[0-9 -]{6,30}$/, {
      error: 'Enter the account or mobile number (digits only).',
    }),
  bank_name: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(80).optional(),
  ),
})

export const completePayoutSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(3, { error: 'Enter the transfer reference (at least 3 characters).' })
    .max(120),
})

export const failPayoutSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, {
      error: 'Say why (at least 5 characters) — the landlord will see it.',
    })
    .max(300),
})
