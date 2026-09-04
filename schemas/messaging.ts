import { z } from 'zod'

import { blankToUndefined } from '@/schemas/_helpers'

export const sendMessageSchema = z.object({
  receiver_id: z.coerce.number().int().positive(),
  property_id: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  reply_to_message_id: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  message: z
    .string()
    .trim()
    .min(1, { error: 'Type a message first.' })
    .max(4000, { error: 'Message is too long.' }),
})

export const editMessageSchema = z.object({
  message_id: z.coerce.number().int().positive(),
  message: z
    .string()
    .trim()
    .min(1, { error: 'Message cannot be empty.' })
    .max(4000, { error: 'Message is too long.' }),
})

export const createInquirySchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, { error: 'Add a short subject.' })
    .max(200, { error: 'Subject is too long.' }),
  message: z
    .string()
    .trim()
    .min(10, { error: 'Tell the landlord what you want to know.' })
    .max(4000, { error: 'Message is too long.' }),
})

export const respondInquirySchema = z.object({
  response: z
    .string()
    .trim()
    .min(1, { error: 'Write a response first.' })
    .max(4000, { error: 'Response is too long.' }),
  close: z.preprocess(
    (v) => v === 'on' || v === 'true' || v === true,
    z.boolean(),
  ),
})
