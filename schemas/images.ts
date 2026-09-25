import { z } from 'zod'

/** Shapes for photo requests coming from a browser or the mobile app (all untrusted). */
const id = z.number().int().positive()

export const imageTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('property'), propertyId: id }),
  z.object({ kind: z.literal('room'), propertyId: id, roomId: id }),
])

export const imageFileInfoSchema = z.object({
  name: z.string().max(300),
  type: z.string().max(100),
  size: z.number().int().nonnegative(),
})

export const uploadedImageSchema = imageFileInfoSchema.extend({
  path: z.string().max(300),
})

export const imageIdSchema = id

/** One mobile call, one shape: `{ op, target, ... }`. */
export const mobileImageRequestSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('prepare'),
    target: imageTargetSchema,
    files: z.array(imageFileInfoSchema).min(1).max(20),
  }),
  z.object({
    op: z.literal('register'),
    target: imageTargetSchema,
    files: z.array(uploadedImageSchema).min(1).max(20),
    coverPath: z.string().max(300).optional(),
  }),
  z.object({
    op: z.literal('cover'),
    target: imageTargetSchema,
    imageId: id,
  }),
  z.object({
    op: z.literal('remove'),
    target: imageTargetSchema,
    imageId: id,
  }),
])
