import { z } from 'zod'

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional())

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: 'Enter your full name.' })
    .max(120, { error: 'Name is too long.' }),
  phone: optionalText(40),
  address: optionalText(500),
})

export type ProfileInput = z.infer<typeof profileSchema>
