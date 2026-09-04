/**
 * The four canonical MyBalai account types (spec §38).
 * `superadmin` replaces the pre-phased-spec `admin` role.
 */
export const APP_ROLES = [
  'tenant',
  'landlord',
  'caretaker',
  'superadmin',
] as const
export type AppRole = (typeof APP_ROLES)[number]

/**
 * Roles a visitor may self-assign at signup (spec §42).
 * Only `tenant` — landlord/caretaker/superadmin are provisioned.
 */
export const SIGNUP_ROLES = ['tenant'] as const
export type SignupRole = (typeof SIGNUP_ROLES)[number]

export const ROLE_LABELS: Record<AppRole, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  caretaker: 'Caretaker',
  superadmin: 'Superadmin',
}

export function isAppRole(value: unknown): value is AppRole {
  return (
    typeof value === 'string' &&
    (APP_ROLES as readonly string[]).includes(value)
  )
}

/** Highest-authority role first. Used to pick a user's primary role + home. */
export const ROLE_PRIORITY: readonly AppRole[] = [
  'superadmin',
  'landlord',
  'caretaker',
  'tenant',
]

/** The role that drives navigation and the post-login landing page. */
export function primaryRole(roles: readonly AppRole[]): AppRole {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? 'tenant'
}

const ROLE_HOME: Record<AppRole, string> = {
  superadmin: '/admin',
  landlord: '/landlord',
  caretaker: '/caretaker',
  tenant: '/dashboard',
}

/** Where a user lands after signing in. */
export function roleHome(roles: readonly AppRole[]): string {
  return ROLE_HOME[primaryRole(roles)]
}
