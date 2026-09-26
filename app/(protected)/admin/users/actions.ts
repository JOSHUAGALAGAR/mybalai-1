'use server'

import { revalidatePath } from 'next/cache'

import * as admin from '@/services/admin.service'
import { ServiceError } from '@/services/errors'

export type UserActionState =
  | { status: 'error'; message: string }
  | { status: 'success'; message: string }
  | undefined

export async function setUserActiveAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const id = Number(formData.get('user_id'))
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 'error', message: 'Invalid user.' }
  }
  try {
    await admin.setUserActive(id, { is_active: formData.get('is_active') })
  } catch (error) {
    if (error instanceof ServiceError) {
      return { status: 'error', message: error.message }
    }
    console.error('[admin/users] action failed:', error)
    return { status: 'error', message: 'Something went wrong.' }
  }
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${id}`)
  return { status: 'success', message: 'Account updated.' }
}

export type ResetPasswordState =
  | { status: 'error'; message: string }
  | { status: 'issued'; email: string; password: string; name: string }
  | undefined

/** A new temporary password for the account, returned once for the admin to pass on. */
export async function resetUserPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const id = Number(formData.get('user_id'))
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 'error', message: 'Invalid user.' }
  }
  try {
    const { email, password, name } = await admin.resetUserPassword(id)
    revalidatePath('/admin/audit')
    return { status: 'issued', email, password, name }
  } catch (error) {
    if (error instanceof ServiceError) {
      return { status: 'error', message: error.message }
    }
    console.error('[admin/users] password reset failed:', error)
    return { status: 'error', message: 'Something went wrong.' }
  }
}
