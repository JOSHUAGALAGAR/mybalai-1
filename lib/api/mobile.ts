import 'server-only'

import {
  getCurrentUser,
  getSessionAuthMethods,
  type CurrentUser,
} from '@/lib/auth/dal'
import type { AppRole } from '@/lib/auth/roles'
import { RepositoryError } from '@/repositories/reference.repository'
import { ServiceError, type ServiceErrorCode } from '@/services/errors'

/**
 * Plumbing for `/api/mobile/*` — the JSON API used by the tenant mobile app.
 *
 * Every route is wrapped in `mobileRoute`, which:
 *  1. authenticates the bearer token (see `getAuthUser` in `lib/auth/dal.ts`),
 *  2. allows tenant accounts only (the app is tenant-only),
 *  3. maps service/repository errors to JSON `{ error }` + a status code.
 *
 * Success is `{ data }`. Errors are `{ error: { code, message, fieldErrors? } }`.
 * Authorization beyond "is a tenant" stays in the service layer, exactly as on
 * the web — these routes are thin adapters over the same services.
 */

const STATUS: Record<ServiceErrorCode, number> = {
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  unknown: 400,
}

/** Requests slower than this are logged so latency regressions are visible. */
const SLOW_REQUEST_MS = 1500

function json(body: unknown, status: number, startedAt?: number): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (startedAt !== undefined) {
    // Visible in the app's network inspector / curl -i to see where time goes.
    headers['Server-Timing'] = `total;dur=${Date.now() - startedAt}`
  }
  return Response.json(body, { status, headers })
}

function fail(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  return json({ error: { code, message, fieldErrors } }, status)
}

/** Next's `redirect()` / `notFound()` throw errors carrying a `digest`. */
function digestOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === 'string' ? digest : null
}

function fromThrown(error: unknown): Response {
  if (error instanceof ServiceError) {
    return fail(
      STATUS[error.code],
      error.code,
      error.message,
      error.fieldErrors,
    )
  }

  // Services reuse the web DAL helpers, which `redirect()` when the caller is
  // signed out or deactivated. Translate that into an HTTP status.
  const digest = digestOf(error)
  if (digest?.startsWith('NEXT_REDIRECT')) {
    return digest.includes('/unauthorized')
      ? fail(403, 'forbidden', 'This account cannot use the app.')
      : fail(401, 'unauthenticated', 'Please sign in again.')
  }
  if (digest?.startsWith('NEXT_HTTP_ERROR_FALLBACK;404')) {
    return fail(404, 'not_found', 'Not found.')
  }

  // A RepositoryError's message is generic; the database's own error is in `cause`.
  console.error(
    '[mobile api]',
    error instanceof RepositoryError
      ? `${error.message} — database said:`
      : error,
    error instanceof RepositoryError ? error.cause : '',
  )
  return fail(500, 'server_error', 'Something went wrong. Please try again.')
}

export type MobileContext<P> = {
  request: Request
  user: CurrentUser
  params: P
}

/** Roles the mobile app serves. Caretakers and superadmins use the web dashboard. */
export type MobileRole = Extract<AppRole, 'tenant' | 'landlord'>

const ROLE_MESSAGE: Record<MobileRole, string> = {
  tenant: 'This is only available to tenant accounts.',
  landlord: 'This is only available to landlord accounts.',
}

/**
 * Wrap a mobile endpoint. `roles` says who may call it (default: tenants).
 *
 * Landlord accounts are created for them by MyBalai, so a Google sign-in must never reach a
 * landlord's data: if the session was authenticated with Google (`oauth`) and the account is a
 * landlord, every endpoint refuses. This is enforced here, on the server, so it cannot be bypassed
 * by editing the app.
 */
export function mobileRoute<P = Record<string, never>>(
  handler: (ctx: MobileContext<P>) => Promise<unknown>,
  options: { roles?: MobileRole[] } = {},
) {
  const allowed = options.roles ?? ['tenant']
  return async (
    request: Request,
    context: { params: Promise<P> },
  ): Promise<Response> => {
    const startedAt = Date.now()
    try {
      const user = await getCurrentUser()
      if (!user) return fail(401, 'unauthenticated', 'Please sign in again.')
      if (!user.isActive) {
        return fail(403, 'forbidden', 'This account has been deactivated.')
      }

      const serves = (['tenant', 'landlord'] as const).filter((r) =>
        user.roles.includes(r),
      )
      if (serves.length === 0) {
        return fail(
          403,
          'unsupported_role',
          'The MyBalai app is for tenants and landlords. Use the web dashboard instead.',
        )
      }

      if (
        user.roles.includes('landlord') &&
        (await getSessionAuthMethods()).includes('oauth')
      ) {
        return fail(
          403,
          'landlord_no_google',
          "Landlord accounts can't sign in with Google. Sign in with your email and password.",
        )
      }

      if (!allowed.some((role) => user.roles.includes(role))) {
        return fail(403, 'wrong_role', ROLE_MESSAGE[allowed[0]])
      }

      const params = (await context.params) ?? ({} as P)
      const data = await handler({ request, user, params })
      const elapsed = Date.now() - startedAt
      if (elapsed > SLOW_REQUEST_MS) {
        console.warn(
          `[mobile api] slow ${request.method} ${new URL(request.url).pathname}: ${elapsed}ms`,
        )
      }
      return json({ data }, 200, startedAt)
    } catch (error) {
      return fromThrown(error)
    }
  }
}

/** Parse a JSON body; a missing/invalid body is a validation error. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ServiceError('Send a JSON body.', 'validation')
  }
}

/** Parse a positive-integer path param or 404. */
export function idParam(value: string | undefined): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new ServiceError('Not found.', 'not_found')
  }
  return n
}
