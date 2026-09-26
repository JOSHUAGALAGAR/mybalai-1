import { getCurrentUser, type CurrentUser } from '@/lib/auth/dal'

/**
 * Guard for admin route handlers (they cannot use the page redirects). Returns the superadmin, or
 * the JSON error to send back. Also insists on a custom header: a page on another site cannot send
 * it without a CORS preflight, which closes the cross-site (CSRF) door for cookie sessions.
 */
export async function requireAdminRequest(
  request: Request,
): Promise<{ user: CurrentUser } | { error: Response }> {
  if (request.headers.get('x-mybalai-admin') !== '1') {
    return { error: Response.json({ error: 'Bad request.' }, { status: 400 }) }
  }
  const user = await getCurrentUser()
  if (!user) {
    return {
      error: Response.json({ error: 'Please sign in again.' }, { status: 401 }),
    }
  }
  if (!user.isActive || !user.roles.includes('superadmin')) {
    return { error: Response.json({ error: 'Not allowed.' }, { status: 403 }) }
  }
  return { user }
}
