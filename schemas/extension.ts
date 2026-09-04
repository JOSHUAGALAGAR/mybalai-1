import { z } from 'zod'

import { blankToUndefined } from '@/schemas/_helpers'

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use the date picker.' })

/** Tenant asks to push their check-out date out. */
export const requestExtensionSchema = z.object({
  new_check_out: isoDate,
  message: z.preprocess(
    blankToUndefined,
    z.string().trim().max(2000).optional(),
  ),
})

export type RequestExtensionInput = z.infer<typeof requestExtensionSchema>

export const EXTENSION_DECISIONS = ['approved', 'rejected'] as const
export type ExtensionDecision = (typeof EXTENSION_DECISIONS)[number]

/** Manager approves or rejects a pending request. */
export const extensionDecisionSchema = z.object({
  to: z.enum(EXTENSION_DECISIONS, { error: 'Choose approve or reject.' }),
  response: z.preprocess(
    blankToUndefined,
    z.string().trim().max(2000).optional(),
  ),
})

export type ExtensionDecisionInput = z.infer<typeof extensionDecisionSchema>
