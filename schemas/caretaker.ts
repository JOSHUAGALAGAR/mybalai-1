import { z } from 'zod'

export const createCaretakerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: 'Enter the caretaker’s full name.' })
    .max(120, { error: 'Name is too long.' }),
  email: z.email({ error: 'Enter a valid email address.' }).trim(),
  password: z
    .string()
    .min(8, { error: 'Temporary password must be at least 8 characters.' })
    .max(72, { error: 'Password must be at most 72 characters.' }),
})

export type CreateCaretakerInput = z.infer<typeof createCaretakerSchema>

export const assignmentsSchema = z.object({
  property_ids: z
    .array(z.coerce.number().int().positive())
    .max(500)
    .default([]),
})

export type AssignmentsInput = z.infer<typeof assignmentsSchema>
