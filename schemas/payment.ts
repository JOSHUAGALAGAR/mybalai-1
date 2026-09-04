import { z } from 'zod'

import { blankToUndefined } from '@/schemas/_helpers'

/** Supabase Storage bucket for payment receipts (see migration 0007b). */
export const RECEIPT_BUCKET = 'payment-receipts'

/** Manager decisions map to these payment_statuses codes. */
export const PAYMENT_DECISIONS = ['paid', 'rejected'] as const
export type PaymentDecision = (typeof PAYMENT_DECISIONS)[number]

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use the date picker.' })

export const createPaymentSchema = z.object({
  booking_id: z.coerce
    .number()
    .int()
    .positive({ error: 'Choose the booking this payment is for.' }),
  amount: z.coerce
    .number({ error: 'Enter the amount paid.' })
    .positive({ error: 'Amount must be greater than zero.' })
    .max(100_000_000, { error: 'Amount is too large.' }),
  method_code: z
    .string()
    .trim()
    .min(1, { error: 'Choose a payment method.' })
    .max(40),
  reference_number: z.preprocess(
    blankToUndefined,
    z.string().trim().max(120).optional(),
  ),
  paid_at: z.preprocess(blankToUndefined, isoDate.optional()),
  note: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
})

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>

export const paymentDecisionSchema = z.object({
  to: z.enum(PAYMENT_DECISIONS, { error: 'Unknown action.' }),
  note: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
})

export const paymentNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, { error: 'Write a note first.' })
    .max(2000, { error: 'Note is too long.' }),
})

export const paymentReplySchema = z.object({
  payment_note_id: z.coerce.number().int().positive().optional(),
  reply: z
    .string()
    .trim()
    .min(1, { error: 'Write a reply first.' })
    .max(2000, { error: 'Reply is too long.' }),
})

export const attachReceiptSchema = z.object({
  storage_path: z.string().trim().min(1).max(500),
  original_filename: z.preprocess(
    blankToUndefined,
    z.string().trim().max(255).optional(),
  ),
  mime_type: z.preprocess(
    blankToUndefined,
    z.string().trim().max(120).optional(),
  ),
  file_size: z.coerce.number().int().nonnegative().max(50_000_000).optional(),
})
