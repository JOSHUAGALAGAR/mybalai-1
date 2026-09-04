'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { reconcilePaymentAction } from '@/app/(protected)/payments/actions'
import { Button } from '@/components/ui/button'

type Status = 'paid' | 'pending' | 'failed' | 'expired' | 'unknown'

const COPY: Record<Status, { title: string; body: string; tone: string }> = {
  pending: {
    title: 'Payment processing…',
    body: 'We are verifying your payment with PayMongo. This can take a few seconds.',
    tone: 'border-border bg-muted/20 text-muted-foreground',
  },
  unknown: {
    title: 'Payment processing…',
    body: 'We are verifying your payment with PayMongo.',
    tone: 'border-border bg-muted/20 text-muted-foreground',
  },
  paid: {
    title: 'Payment successful',
    body: 'Your payment is verified and the booking is confirmed.',
    tone: 'border-primary/40 bg-primary/5 text-foreground',
  },
  failed: {
    title: 'Payment was unsuccessful',
    body: 'You can try again while your payment window is still open.',
    tone: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
  expired: {
    title: 'Payment window expired',
    body: 'This booking’s payment window has closed. Submit a new request if you still want it.',
    tone: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
}

export function PaymentSettlementPoller({
  paymentId,
  initialStatus,
}: {
  paymentId: number
  initialStatus: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>(
    (initialStatus as Status) ?? 'pending',
  )
  const [checking, setChecking] = useState(false)
  const tries = useRef(0)

  const check = async () => {
    setChecking(true)
    try {
      const r = await reconcilePaymentAction(paymentId)
      setStatus(r.status)
      if (
        r.status === 'paid' ||
        r.status === 'failed' ||
        r.status === 'expired'
      ) {
        router.refresh()
        return true
      }
    } finally {
      setChecking(false)
    }
    return false
  }

  useEffect(() => {
    if (status === 'paid' || status === 'failed' || status === 'expired') return
    let cancelled = false
    const tick = async () => {
      if (cancelled || tries.current >= 10) return
      tries.current += 1
      const done = await check()
      if (!cancelled && !done) setTimeout(tick, 3000)
    }
    const t = setTimeout(tick, 1500)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (initialStatus === 'paid' && status === 'paid') return null

  const copy = COPY[status] ?? COPY.pending
  return (
    <div className={`rounded-lg border p-4 ${copy.tone}`}>
      <p className="text-sm font-semibold">{copy.title}</p>
      <p className="mt-1 text-sm">{copy.body}</p>
      {(status === 'pending' || status === 'unknown') && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={checking}
          onClick={() => check()}
        >
          {checking ? 'Checking…' : 'Check now'}
        </Button>
      )}
    </div>
  )
}
