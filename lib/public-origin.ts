/**
 * The address people actually use to reach the site, for redirects built inside route handlers.
 *
 * Behind the production proxy the request URL says `https://localhost:3004` (the internal address), so a
 * redirect built from it sends people to a page that does not exist for them. In production the configured
 * `NEXT_PUBLIC_SITE_URL` wins; otherwise the forwarded / host headers; otherwise the request's own origin
 * (right for local development).
 */
export function publicOrigin(
  request: Request,
  env: { NODE_ENV?: string; NEXT_PUBLIC_SITE_URL?: string } = process.env,
): string {
  const configured = env.NEXT_PUBLIC_SITE_URL
  if (env.NODE_ENV === 'production' && configured) {
    try {
      return new URL(configured).origin
    } catch {
      // fall through to the headers
    }
  }
  const headers = request.headers
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (host && !/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
    const proto =
      headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
      new URL(request.url).protocol.replace(':', '')
    return `${proto}://${host.split(',')[0].trim()}`
  }
  return new URL(request.url).origin
}
