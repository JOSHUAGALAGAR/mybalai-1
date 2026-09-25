import { z } from 'zod'

/** Deleting an account must be typed out — a stray tap can't do it. */
export const deleteAccountSchema = z.object({
  confirm: z
    .string({ error: 'Type DELETE to confirm.' })
    .refine((v) => v.trim().toUpperCase() === 'DELETE', {
      error: 'Type DELETE to confirm.',
    }),
})
