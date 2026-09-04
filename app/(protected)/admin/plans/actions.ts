'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import * as subscriptions from '@/services/subscriptions.service'
import { ServiceError } from '@/services/errors'

export type PlanActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string>
    }
  | undefined

function toObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

function toErrorState(
  error: unknown,
  values: Record<string, string>,
): PlanActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[admin/plans] action failed:', error)
  return { status: 'error', message: 'Something went wrong.', values }
}

export async function createPlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const values = toObject(formData)
  try {
    await subscriptions.createPlan(values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/admin/plans')
  redirect('/admin/plans')
}

export async function updatePlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const values = toObject(formData)
  const planId = Number(values.plan_id)
  try {
    await subscriptions.updatePlan(planId, values)
  } catch (error) {
    return toErrorState(error, values)
  }
  revalidatePath('/admin/plans')
  redirect('/admin/plans')
}
