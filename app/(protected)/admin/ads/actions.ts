'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import * as ads from '@/services/ads.service'
import { ServiceError } from '@/services/errors'

export type AdActionState =
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string[]>
      values?: Record<string, string | string[]>
    }
  | undefined

function toObject(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(formData.keys())) {
    const all = formData
      .getAll(key)
      .filter((v): v is string => typeof v === 'string')
    out[key] = all.length > 1 || key === 'target_roles' ? all : (all[0] ?? '')
  }
  return out
}

function toErrorState(
  error: unknown,
  values: Record<string, string | string[]>,
): AdActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
      values,
    }
  }
  console.error('[admin/ads] action failed:', error)
  return { status: 'error', message: 'Something went wrong.', values }
}

function refresh() {
  revalidatePath('/admin/ads')
  // banners sit on the role dashboards
  revalidatePath('/dashboard')
  revalidatePath('/landlord')
  revalidatePath('/caretaker')
}

export async function createAdAction(
  _prev: AdActionState,
  formData: FormData,
): Promise<AdActionState> {
  const values = toObject(formData)
  try {
    await ads.createAd(values)
  } catch (error) {
    return toErrorState(error, values)
  }
  refresh()
  redirect('/admin/ads')
}

export async function updateAdAction(
  _prev: AdActionState,
  formData: FormData,
): Promise<AdActionState> {
  const values = toObject(formData)
  try {
    await ads.updateAd(Number(values.ad_id), values)
  } catch (error) {
    return toErrorState(error, values)
  }
  refresh()
  redirect('/admin/ads')
}

export async function toggleAdAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('ad_id'))
  if (!Number.isInteger(id) || id <= 0) return
  await ads.setAdActive(id, formData.get('is_active') === 'true')
  refresh()
}

export async function deleteAdAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('ad_id'))
  if (!Number.isInteger(id) || id <= 0) return
  await ads.deleteAd(id)
  refresh()
  redirect('/admin/ads')
}

export async function prepareAdImageAction(input: {
  name: string
  type: string
  size: number
}): Promise<
  { ok: true; path: string; token: string } | { ok: false; message: string }
> {
  try {
    return { ok: true, ...(await ads.prepareAdImage(input)) }
  } catch (error) {
    if (error instanceof ServiceError)
      return { ok: false, message: error.message }
    console.error('[admin/ads] prepare image failed:', error)
    return {
      ok: false,
      message: 'Could not start the upload. Please try again.',
    }
  }
}
