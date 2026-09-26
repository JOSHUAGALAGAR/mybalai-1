import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

import { APK_DOWNLOAD_NAME, getAndroidApp, parseRange } from '@/lib/android-app'

export const dynamic = 'force-dynamic'

const HEADERS = {
  'Content-Type': 'application/vnd.android.package-archive',
  'Content-Disposition': `attachment; filename="${APK_DOWNLOAD_NAME}"`,
  'Cache-Control': 'public, max-age=300',
  'Accept-Ranges': 'bytes',
}

/**
 * Public download of the Android app. 404 until an APK has been uploaded to the server. Supports
 * byte ranges so a phone can resume a big download on a weak connection.
 */
export async function GET(request: Request) {
  const app = await getAndroidApp()
  if (!app) {
    return new Response('The Android app is not available yet.', { status: 404 })
  }
  const range = parseRange(request.headers.get('range'), app.bytes)
  const start = range?.start ?? 0
  const end = range?.end ?? app.bytes - 1
  const body = Readable.toWeb(createReadStream(app.path, { start, end })) as ReadableStream
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...HEADERS,
      'Content-Length': String(end - start + 1),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${app.bytes}` } : {}),
    },
  })
}

export async function HEAD() {
  const app = await getAndroidApp()
  if (!app) return new Response(null, { status: 404 })
  return new Response(null, {
    headers: { ...HEADERS, 'Content-Length': String(app.bytes) },
  })
}
