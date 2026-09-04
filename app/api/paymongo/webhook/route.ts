import { PaymongoError } from '@/lib/paymongo/client'
import { handleWebhook } from '@/services/paymongo.service'

// Webhooks must run on Node (crypto + service-role DB writes), never cached.
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text()
  const signature = request.headers.get('paymongo-signature')

  try {
    await handleWebhook(raw, signature)
  } catch (error) {
    if (error instanceof PaymongoError && error.status === 401) {
      return new Response('invalid signature', { status: 401 })
    }
    // Non-2xx tells PayMongo to retry — appropriate for a transient failure.
    console.error('[paymongo webhook] fulfilment failed:', error)
    return new Response('error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
