import { runGeocode } from '@/services/geocode-request'
import { ServiceError } from '@/services/errors'

export const dynamic = 'force-dynamic'

const STATUS = {
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
} as const

/**
 * Address search (`?q=`) and pin → address (`?lat=&lng=`) for the web property form.
 * Signed-in only (the proxy redirects anonymous browsers; the service also checks the role).
 */
export async function GET(request: Request) {
  try {
    const data = await runGeocode(new URL(request.url).searchParams)
    return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: STATUS[error.code as keyof typeof STATUS] ?? 400 },
      )
    }
    // `requireUser()` signals "signed out" by throwing Next's redirect — let it through.
    const digest = (error as { digest?: unknown })?.digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw error
    console.error('[api/geocode] failed:', error)
    return Response.json(
      { error: { code: 'unknown', message: 'Something went wrong.' } },
      { status: 500 },
    )
  }
}
