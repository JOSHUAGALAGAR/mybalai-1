import { z } from 'zod'

import { AD_ROLE_CODES, MAX_AD_IMAGE_BYTES } from '@/lib/ads/rules'

const flag = z.preprocess(
  (v) => v === 'true' || v === 'on' || v === true || v === '1',
  z.boolean(),
)
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')
  .refine(
    (v) => !Number.isNaN(Date.parse(`${v}T00:00:00+08:00`)),
    'Pick a valid date.',
  )
const optionalDay = z.preprocess(
  (v) => (v === '' ? undefined : v),
  day.optional(),
)
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max, message).optional(),
  )

export const adFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'Enter a title (at least 2 characters).')
      .max(120, 'Keep the title under 120 characters.'),
    body: optionalText(500, 'Keep the text under 500 characters.'),
    link_url: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z
        .string()
        .trim()
        .max(500)
        .refine((v) => {
          try {
            const u = new URL(v)
            return u.protocol === 'https:' || u.protocol === 'http:'
          } catch {
            return false
          }
        }, 'Enter a full link starting with https://')
        .optional(),
    ),
    link_label: optionalText(40, 'Keep the button text under 40 characters.'),
    // a single checkbox arrives as a string, several as an array
    target_roles: z
      .preprocess(
        (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []),
        z.array(z.enum(AD_ROLE_CODES)),
      )
      .refine((v) => v.length > 0, 'Choose who should see this ad.'),
    is_active: flag,
    starts_on: optionalDay,
    ends_on: optionalDay,
    image_path: optionalText(200, 'Invalid picture.'),
    remove_image: flag.optional(),
  })
  .refine((d) => !d.starts_on || !d.ends_on || d.ends_on >= d.starts_on, {
    path: ['ends_on'],
    message: 'The end date cannot be before the start date.',
  })

export type AdFormInput = z.infer<typeof adFormSchema>

export const adImageUploadSchema = z.object({
  name: z.string().max(200).optional(),
  type: z.string(),
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_AD_IMAGE_BYTES, 'The picture must be 3 MB or smaller.'),
})
