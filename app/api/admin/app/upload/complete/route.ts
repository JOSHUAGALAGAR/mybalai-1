import { requireAdminRequest } from '@/lib/admin-api'
import { completeUpload, UploadError } from '@/lib/apk-upload'
import { formatMegabytes } from '@/lib/android-app'
import { recordAudit } from '@/services/audit.service'

export const dynamic = 'force-dynamic'

/** All pieces sent: check the file and publish it as the landing page's APK. */
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if ('error' in auth) return auth.error

  const body = (await request.json().catch(() => null)) as {
    upload?: string
    totalBytes?: number
    version?: string
  } | null
  const version = body?.version?.trim().slice(0, 40) || null

  try {
    const { bytes } = await completeUpload(
      body?.upload ?? null,
      Number(body?.totalBytes),
      {
        version,
        uploadedBy: auth.user.fullName || auth.user.email || null,
      },
    )
    await recordAudit({
      actor: auth.user,
      action: 'app.apk_published',
      targetType: 'android_app',
      summary: `Uploaded the Android app${version ? ` v${version}` : ''} (${formatMegabytes(bytes)})`,
    })
    return Response.json({ ok: true, bytes })
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json(
        { error: error.message, received: error.received },
        { status: error.status },
      )
    }
    console.error('[apk-upload] publish failed', error)
    return Response.json(
      { error: 'Could not publish the file.' },
      { status: 500 },
    )
  }
}
