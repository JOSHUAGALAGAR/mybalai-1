import { z } from 'zod'

export type ServiceErrorCode =
  'forbidden' | 'not_found' | 'validation' | 'conflict' | 'unknown'

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: ServiceErrorCode = 'unknown',
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

/** Parse with a zod schema or throw a `validation` ServiceError. */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.infer<S> {
  const result = schema.safeParse(input)
  if (result.success) return result.data

  const { fieldErrors } = z.flattenError(result.error)
  const normalized: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(fieldErrors)) {
    const messages = value as string[] | undefined
    if (messages && messages.length > 0) normalized[key] = messages
  }
  throw new ServiceError(
    'Please correct the highlighted fields.',
    'validation',
    normalized,
  )
}
