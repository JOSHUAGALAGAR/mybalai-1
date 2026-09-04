import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { serverEnv } from '@/lib/env.server'

const API_BASE = 'https://api.paymongo.com/v1'

export class PaymongoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'PaymongoError'
  }
}

function authHeader(): string {
  const key = serverEnv.paymongo.secretKey
  if (!key) throw new PaymongoError('PayMongo is not configured.')
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`
}

async function call<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const detail =
      (json as { errors?: { detail?: string }[] } | null)?.errors?.[0]
        ?.detail ?? text
    throw new PaymongoError(
      `PayMongo ${init.method} ${path} failed (${res.status}): ${detail}`,
      res.status,
      json,
    )
  }
  return json as T
}

export type PaymongoResource = {
  id?: string
  type?: string
  attributes?: {
    checkout_url?: string
    status?: string
    amount?: number
    currency?: string
    metadata?: Record<string, string> | null
    payment_intent?: {
      id?: string
      attributes?: { status?: string; amount?: number; currency?: string }
    } | null
    payments?:
      | {
          id?: string
          attributes?: { status?: string; amount?: number; currency?: string }
        }[]
      | null
  }
}

export type CheckoutSession = {
  id: string
  checkoutUrl: string
  status: string
  paymentIntentId: string | null
  raw: PaymongoResource
}

function toSession(raw: { data: PaymongoResource }): CheckoutSession {
  return {
    id: raw.data.id ?? '',
    checkoutUrl: raw.data.attributes?.checkout_url ?? '',
    status: raw.data.attributes?.status ?? 'unknown',
    paymentIntentId: raw.data.attributes?.payment_intent?.id ?? null,
    raw: raw.data,
  }
}

/**
 * Pull the settled amount/currency/payment-id out of a `checkout_session` or a
 * `payment` resource. Returns null when nothing in it is `paid`.
 */
export function extractPaidPayment(resource: PaymongoResource): {
  amountCentavos: number
  currency: string
  paymongoPaymentId: string | null
} | null {
  const a = resource.attributes ?? {}

  // A `payment` resource itself.
  if (resource.type === 'payment' && a.status === 'paid') {
    return {
      amountCentavos: a.amount ?? 0,
      currency: (a.currency ?? 'PHP').toUpperCase(),
      paymongoPaymentId: resource.id ?? null,
    }
  }

  // A checkout_session with a paid payment inside it.
  const paid = (a.payments ?? []).find((p) => p.attributes?.status === 'paid')
  if (paid) {
    return {
      amountCentavos: paid.attributes?.amount ?? 0,
      currency: (paid.attributes?.currency ?? 'PHP').toUpperCase(),
      paymongoPaymentId: paid.id ?? null,
    }
  }

  const intent = a.payment_intent?.attributes
  if (intent?.status === 'succeeded' || intent?.status === 'paid') {
    return {
      amountCentavos: intent.amount ?? 0,
      currency: (intent.currency ?? 'PHP').toUpperCase(),
      paymongoPaymentId: a.payment_intent?.id ?? null,
    }
  }
  return null
}

/** Amount is in PHP; PayMongo wants centavos. Minimum is ₱20.00. */
export async function createCheckoutSession(input: {
  amountPhp: number
  name: string
  description: string
  referenceNumber: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}): Promise<CheckoutSession> {
  const centavos = Math.round(input.amountPhp * 100)
  if (centavos < 2000) {
    throw new PaymongoError('The minimum online payment is ₱20.00.')
  }
  // PayMongo requires payment_method_types. Every listed method must be
  // ENABLED on the account (Settings -> Payment Methods) or the whole session
  // is rejected — so default to `card` (on by default everywhere) and let the
  // deployment opt into more, e.g. PAYMONGO_METHODS="card,gcash,paymaya,grab_pay,qrph".
  const envMethods = (process.env.PAYMONGO_METHODS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  const methods = envMethods.length ? envMethods : ['card']

  const raw = await call<{ data: PaymongoResource }>('/checkout_sessions', {
    method: 'POST',
    body: {
      data: {
        attributes: {
          line_items: [
            {
              currency: 'PHP',
              amount: centavos,
              name: input.name,
              quantity: 1,
            },
          ],
          payment_method_types: methods,
          description: input.description,
          reference_number: input.referenceNumber,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: input.metadata,
        },
      },
    },
  })
  return toSession(raw)
}

export async function getCheckoutSession(id: string): Promise<CheckoutSession> {
  const raw = await call<{ data: PaymongoResource }>(
    `/checkout_sessions/${id}`,
    {
      method: 'GET',
    },
  )
  return toSession(raw)
}

/**
 * Verify a `Paymongo-Signature: t=<ts>,te=<test>,li=<live>` header.
 * The signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the webhook secret.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = serverEnv.paymongo.webhookSecret
  if (!secret || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=')
      return [k?.trim(), v?.trim()]
    }),
  ) as { t?: string; te?: string; li?: string }

  if (!parts.t) return false
  const expected = createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex')

  for (const candidate of [parts.te, parts.li]) {
    if (!candidate || candidate.length !== expected.length) continue
    if (
      timingSafeEqual(
        Buffer.from(candidate, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    ) {
      return true
    }
  }
  return false
}
