import 'server-only'

/**
 * Server-only environment values. Importing this module from client code is a
 * build error thanks to the `server-only` guard.
 */

const secretKey = process.env.SUPABASE_SECRET_KEY

if (!secretKey) {
  throw new Error(
    'Missing environment variable SUPABASE_SECRET_KEY. Copy .env.example to .env.local and fill it in.',
  )
}

export const serverEnv = {
  supabaseSecretKey: secretKey,
  /**
   * PayMongo (test or live). Optional — when unset, the online-payment
   * features stay hidden and the app runs on the manual flows only.
   */
  paymongo: {
    secretKey: process.env.PAYMONGO_SECRET_KEY ?? null,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET ?? null,
  },
} as const

/** True when PayMongo is configured enough to create checkout sessions. */
export function isPaymongoConfigured(): boolean {
  return Boolean(serverEnv.paymongo.secretKey)
}
