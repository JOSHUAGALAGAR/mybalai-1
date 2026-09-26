import { after } from 'next/server'

import {
  getWebhookSecret,
  installRelease,
  releaseFromPayload,
  verifySignature,
} from '@/lib/eas-webhook'

export const dynamic = 'force-dynamic'

/**
 * Expo build webhook: publishes each finished Android preview build as the landing page's APK.
 * Authenticated by Expo's HMAC signature, not a session (see the public paths in `lib/supabase/proxy.ts`).
 */
export async function POST(request: Request) {
  const secret = await getWebhookSecret()
  if (!secret) {
    return Response.json({ error: 'Not configured.' }, { status: 503 })
  }

  const raw = await request.text()
  if (!verifySignature(raw, request.headers.get('expo-signature'), secret)) {
    return Response.json({ error: 'Bad signature.' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Bad JSON.' }, { status: 400 })
  }

  const release = releaseFromPayload(payload)
  if (!release) return Response.json({ ok: true, ignored: true })

  // Answer Expo straight away; the download takes a while.
  after(async () => {
    try {
      const result = await installRelease(release)
      console.log(`[eas-webhook] build ${release.buildId}: ${result}`)
    } catch (error) {
      console.error(`[eas-webhook] build ${release.buildId} failed`, error)
    }
  })
  return Response.json({ ok: true, accepted: true }, { status: 202 })
}
