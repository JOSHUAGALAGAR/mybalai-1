import { z } from 'zod'

import { ID_TYPE_CODES } from '@/lib/identity/rules'

const fileInfo = z.object({
  name: z.string().max(300),
  type: z.string().max(100),
  size: z.number().int().nonnegative(),
})

/** Ask for upload links for the two sides of an ID. */
export const idUploadRequestSchema = z.object({
  idType: z.enum(ID_TYPE_CODES, { error: 'Choose the type of ID.' }),
  front: fileInfo,
  back: fileInfo,
})

/** Hand in the uploaded files for review. */
export const idSubmitSchema = z.object({
  idType: z.enum(ID_TYPE_CODES, { error: 'Choose the type of ID.' }),
  frontPath: z.string().max(300),
  backPath: z.string().max(300),
})

export const avatarUploadSchema = fileInfo
export const avatarRegisterSchema = z.object({ path: z.string().max(300) })

/** One mobile call, one shape: `{ op, ... }`. */
export const verificationRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('prepare') }).extend(idUploadRequestSchema.shape),
  z.object({ op: z.literal('submit') }).extend(idSubmitSchema.shape),
])

export const avatarRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('prepare') }).extend(avatarUploadSchema.shape),
  z.object({ op: z.literal('register') }).extend(avatarRegisterSchema.shape),
  z.object({ op: z.literal('remove') }),
])

export const REJECT_REASON_MIN = 5
export const REJECT_REASON_MAX = 500

/** The admin's decision. A rejection must say why (the tenant sees it). */
export const decisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject'], {
      error: 'Choose approve or reject.',
    }),
    reason: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z
        .string()
        .trim()
        .min(REJECT_REASON_MIN, {
          error: `Say why, in at least ${REJECT_REASON_MIN} characters.`,
        })
        .max(REJECT_REASON_MAX, {
          error: 'Keep the reason under 500 characters.',
        })
        .optional(),
    ),
  })
  .refine((d) => d.decision === 'approve' || d.reason !== undefined, {
    error: 'Say why you are rejecting this ID — the tenant will see it.',
    path: ['reason'],
  })

export type Decision = z.infer<typeof decisionSchema>
