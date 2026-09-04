'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { profileSchema } from '@/schemas/profile'

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

  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { success: 'Your profile has been updated.' }
}
