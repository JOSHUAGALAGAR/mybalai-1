'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '@/schemas/auth'

export type AuthFormState =
  | {
      error?: string
      fieldErrors?: Record<string, string[]>
      success?: string
      values?: { email?: string; fullName?: string }
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

function safeNext(value: FormDataEntryValue | null): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
    ? value
    : '/dashboard'
}

/**
 * Where to go once Google / a reset link has signed the person in. It travels in a short-lived cookie
 * rather than in the redirect address: the project's redirect allow-list matches addresses exactly, so an
 * address with `?next=…` on it is refused and the sign-in ends on the wrong site.
 */
const AUTH_NEXT_COOKIE = 'mb_auth_next'
async function rememberNext(next: string): Promise<void> {
  ;(await cookies()).set(AUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60,
    path: '/',
  })
}

async function siteOrigin(): Promise<string> {
  const fromHeader = (await headers()).get('origin')
  if (fromHeader) return fromHeader
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

/* ------------------------------------------------------------------ *
 * Email / password
 * ------------------------------------------------------------------ */

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsOf(parsed.error),
      values: { email: String(formData.get('email') ?? '') },
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return {
      error: 'Invalid email or password.',
      values: { email: parsed.data.email },
    }
  }

  revalidatePath('/', 'layout')
  redirect(safeNext(formData.get('next')))
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  }
  const parsed = signupSchema.safeParse(raw)
  const echo = {
    fullName: String(raw.fullName ?? ''),
    email: String(raw.email ?? ''),
  }

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: echo }
  }

  const { email, password, fullName } = parsed.data
  const supabase = await createClient()

  // Public signup is tenant-only (spec §42). `handle_new_user` reads this.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role: 'tenant' },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
    },
  })

  if (error) {
    const message = /already registered|already exists/i.test(error.message)
      ? 'An account with this email already exists. Try signing in.'
      : 'Could not create your account. Please try again.'
    return { error: message, values: echo }
  }

  revalidatePath('/', 'layout')

  // Email confirmation ON -> no session yet.
  if (!data.session) {
    redirect('/login?check_email=1')
  }

  redirect('/dashboard')
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

/* ------------------------------------------------------------------ *
 * Google OAuth (tenant onboarding)
 * ------------------------------------------------------------------ */

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const next = safeNext(formData.get('next'))
  const origin = await siteOrigin()

  await rememberNext(next)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data.url) {
    redirect('/login?error=oauth')
  }

  redirect(data.url)
}

/* ------------------------------------------------------------------ *
 * Password reset
 * ------------------------------------------------------------------ */

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsOf(parsed.error),
      values: { email: String(formData.get('email') ?? '') },
    }
  }

  const supabase = await createClient()
  await rememberNext('/reset-password')
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/callback`,
  })

  // Always report success — do not reveal whether the email is registered.
  return {
    success:
      'If an account exists for that address, a password reset link is on its way.',
    values: { email: parsed.data.email },
  }
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error:
        'Your reset link is invalid or has expired. Request a new one below.',
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })
  if (error) {
    return { error: 'Could not update your password. Please try again.' }
  }

  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login?reset=done')
}
