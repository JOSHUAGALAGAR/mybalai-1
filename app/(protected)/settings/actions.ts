'use server'

import { createClient as createPlainClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { invalidateCurrentUser, requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { publicEnv } from '@/lib/env'
import { changePasswordSchema } from '@/schemas/auth'
import { deleteAccountSchema } from '@/schemas/account'
import { profileSchema } from '@/schemas/profile'
import * as accountDeletion from '@/services/account-deletion.service'
import { ServiceError } from '@/services/errors'
import * as profilePhoto from '@/services/profile-photo.service'
import * as verification from '@/services/verification.service'

export type ProfileFormState =
  | {
      error?: string
      fieldErrors?: Record<string, string[]>
      success?: string
    }
  | undefined

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const { fieldErrors } = z.flattenError(error)
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(fieldErrors)) {
    const messages = value as string[] | undefined
    if (messages && messages.length > 0) out[key] = messages
  }
  return out
}

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser()

  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    address: formData.get('address'),
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) }
  }

  // RLS `user_accounts_self_update` scopes this to the caller's own row.
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_accounts')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
    })
    .eq('legacy_user_id', user.legacyUserId)

  if (error) {
    return { error: 'Could not save your changes. Please try again.' }
  }

  invalidateCurrentUser(user.authUserId) // the next page shows the new name at once
  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { success: 'Your profile has been updated.' }
}

/* ------------------------------------------------------------------ *
 * Password
 * ------------------------------------------------------------------ */

export type PasswordFormState =
  | { error?: string; fieldErrors?: Record<string, string[]>; success?: string }
  | undefined

/** Does the signed-in person have an email + password identity (as opposed to Google only)? */
async function hasPasswordLogin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const providers =
    (user?.app_metadata?.providers as string[] | undefined) ?? []
  return providers.includes('email')
}

/**
 * Check a password without touching the browser's session: a throwaway client that keeps
 * nothing. (Signing in on the real cookie client would replace the session.)
 */
async function passwordIsCorrect(
  email: string,
  password: string,
): Promise<boolean> {
  const client = createPlainClient(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (error || !data.session) return false
  await client.auth.signOut({ scope: 'local' }).catch(() => {})
  return true
}

export async function changePassword(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const user = await requireUser()
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) }

  if (!user.email || !(await hasPasswordLogin())) {
    return {
      error:
        'This account signs in with Google, so it has no password to change.',
    }
  }
  if (!(await passwordIsCorrect(user.email, parsed.data.currentPassword))) {
    return {
      fieldErrors: { currentPassword: ['That is not your current password.'] },
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })
  if (error)
    return { error: 'Could not update your password. Please try again.' }
  return { success: 'Your password was changed.' }
}

/* ------------------------------------------------------------------ *
 * Profile photo and ID verification (called from the browser, which then uploads straight to Storage)
 * ------------------------------------------------------------------ */

export type ActionResult<T> =
  ({ ok: true } & T) | { ok: false; message: string }

async function guard<T>(
  what: string,
  work: () => Promise<T>,
): Promise<ActionResult<T extends object ? T : { value: T }>> {
  try {
    const value = await work()
    return {
      ok: true,
      ...(typeof value === 'object' && value !== null ? value : { value }),
    } as never
  } catch (error) {
    if (error instanceof ServiceError)
      return { ok: false, message: error.message }
    console.error(`[settings] ${what} failed:`, error)
    return { ok: false, message: 'Something went wrong. Please try again.' }
  }
}

export async function prepareAvatarAction(input: {
  name: string
  type: string
  size: number
}) {
  return guard('prepare avatar', () => profilePhoto.prepareAvatarUpload(input))
}

export async function registerAvatarAction(input: { path: string }) {
  const result = await guard('register avatar', () =>
    profilePhoto.registerAvatar(input),
  )
  if (result.ok) revalidatePath('/', 'layout')
  return result
}

export async function removeAvatarAction() {
  const result = await guard('remove avatar', async () => {
    await profilePhoto.removeAvatar()
    return {}
  })
  if (result.ok) revalidatePath('/', 'layout')
  return result
}

type FileInfo = { name: string; type: string; size: number }

export async function prepareIdAction(input: {
  idType: string
  front: FileInfo
  back: FileInfo
}) {
  return guard('prepare id', () => verification.prepareIdUpload(input))
}

export async function submitIdAction(input: {
  idType: string
  frontPath: string
  backPath: string
}) {
  const result = await guard('submit id', () =>
    verification.submitVerification(input),
  )
  if (result.ok) revalidatePath('/settings')
  return result
}

/* ------------------------------------------------------------------ *
 * Delete my account
 * ------------------------------------------------------------------ */

export type DeleteFormState =
  { error?: string; fieldErrors?: Record<string, string[]> } | undefined

export async function deleteAccountAction(
  _prev: DeleteFormState,
  formData: FormData,
): Promise<DeleteFormState> {
  const user = await requireUser()

  const parsed = deleteAccountSchema.safeParse({
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) }

  if (!user.email || !(await hasPasswordLogin())) {
    return {
      error:
        'This account signs in with Google. Delete it from the MyBalai app instead.',
    }
  }
  const password = String(formData.get('password') ?? '')
  if (!password)
    return { fieldErrors: { password: ['Enter your password to confirm.'] } }
  if (!(await passwordIsCorrect(user.email, password))) {
    return { fieldErrors: { password: ['That is not your password.'] } }
  }

  try {
    await accountDeletion.deleteMyAccount(
      { confirm: parsed.data.confirm },
      { passwordConfirmed: true },
    )
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message }
    console.error('[settings] account deletion failed:', error)
    return { error: 'Could not delete your account. Please try again.' }
  }

  const supabase = await createClient()
  await supabase.auth.signOut().catch(() => {})
  revalidatePath('/', 'layout')
  redirect('/login?deleted=1')
}
