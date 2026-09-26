import { requireAdminRequest } from '@/lib/admin-api'
import { appendChunk, UploadError } from '@/lib/apk-upload'

export const dynamic = 'force-dynamic'

/** One piece of the APK: `?upload=<uuid>&offset=<bytes>`, raw bytes in the body. */
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if ('error' in auth) return auth.error

  const url = new URL(request.url)
  try {
    const chunk = Buffer.from(await request.arrayBuffer())
    const received = await appendChunk(
      url.searchParams.get('upload'),
      Number(url.searchParams.get('offset')),
      chunk,
    )
    return Response.json({ received })
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json(
        { error: error.message, received: error.received },
        { status: error.status },
      )
    }
    console.error('[apk-upload] chunk failed', error)
    return Response.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
