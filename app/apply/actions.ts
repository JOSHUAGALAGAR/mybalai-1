'use server'

import { headers } from 'next/headers'

import { clientIp, createRateLimiter } from '@/lib/rate-limit'
import { ServiceError } from '@/services/errors'
import {
  prepareApplicationUploads,
  submitApplication,
} from '@/services/applications.service'

// Per visitor: a handful of tries every 15 minutes is plenty for a real applicant.
const submitLimiter = createRateLimiter({ max: 6, windowMs: 15 * 60_000 })
const uploadLimiter = createRateLimiter({ max: 8, windowMs: 15 * 60_000 })
const TOO_MANY =
  'Too many attempts from your connection. Please wait a few minutes and try again.'

export type ApplyState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | { status: 'success'; reference: string }
  | undefined

export async function submitApplicationAction(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries())
    if (typeof v === 'string') values[k] = v
  if (!submitLimiter.hit(clientIp(await headers()))) {
    return { status: 'error', message: TOO_MANY, values }
  }
  try {
    const { reference } = await submitApplication(values)
    return { status: 'success', reference }
  } catch (error) {
    if (error instanceof ServiceError) {
      return {
        status: 'error',
        message: error.message,
        fieldErrors: error.fieldErrors,
        values,
      }
    }
    console.error('[apply] submit failed:', error)
    return {
      status: 'error',
      message: 'Something went wrong. Please try again in a moment.',
      values,
    }
  }
}

export type PrepareResult =
  | {
      ok: true
      batchId: string
      uploads: { index: number; path: string; token: string }[]
    }
  | { ok: false; message: string }

/** Ask for one-time upload links for the chosen documents (called from the browser before submitting). */
export async function prepareUploadsAction(input: {
  website?: string
  docs: { type: string; name: string; mime: string; size: number }[]
}): Promise<PrepareResult> {
  if (!uploadLimiter.hit(clientIp(await headers())))
    return { ok: false, message: TOO_MANY }
  try {
    return { ok: true, ...(await prepareApplicationUploads(input)) }
  } catch (error) {
    if (error instanceof ServiceError)
      return { ok: false, message: error.message }
    console.error('[apply] prepare uploads failed:', error)
    return {
      ok: false,
      message: 'Could not start the upload. Please try again.',
    }
  }
}
