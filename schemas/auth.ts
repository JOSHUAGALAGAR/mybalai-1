import { z } from 'zod'

const email = z.email({ error: 'Enter a valid email address.' }).trim()

const newPassword = z
  .string()
  .min(8, { error: 'Password must be at least 8 characters.' })
  .max(72, { error: 'Password must be at most 72 characters.' })

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Password is required.' }),
})
export type LoginInput = z.infer<typeof loginSchema>

export const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { error: 'Enter your full name.' })
      .max(120, { error: 'Name is too long.' }),
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, { error: 'Confirm your password.' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
export type SignupInput = z.infer<typeof signupSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, { error: 'Confirm your password.' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: 'Enter your current password.' }),
    password: newPassword,
    confirmPassword: z.string().min(1, { error: 'Confirm your new password.' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.password !== data.currentPassword, {
    error: 'Choose a password you have not used just now.',
    path: ['password'],
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
