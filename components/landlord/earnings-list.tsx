import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatPct } from '@/lib/payouts/rules'
import type { EarningView, PayoutView } from '@/services/payouts.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})
const day = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'Asia/Manila',
})

const EARNING_STATE = {
  pending: 'In hold',
  in_payout: 'Being withdrawn',
  paid_out: 'Withdrawn',
  reversed: 'Reversed',
} as const

/**
 * What the landlord earned from each online payment: the NET amount, and the two deductions that
 * explain it. (The tenant's full payment is deliberately not the headline.)
 */
export function EarningsList({ earnings }: { earnings: EarningView[] }) {
  if (earnings.length === 0) {
    return (
      <EmptyState
        title="No earnings yet"
        description="When a tenant pays for a booking online, your earnings appear here — after PayMongo’s and MyBalai’s fees."
      />
    )
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Payment</th>
            <th className="px-3 py-2 text-right font-medium">PayMongo fee</th>
            <th className="px-3 py-2 text-right font-medium">MyBalai fee</th>
            <th className="px-3 py-2 text-right font-medium">You earn (net)</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {earnings.map((e) => (
            <tr key={e.earningId} className="align-top">
              <td className="px-3 py-2">
                {e.bookingId ? (
                  <Link
                    href={`/landlord/bookings/${e.bookingId}`}
                    className="font-medium hover:underline"
                  >
                    Booking #{e.bookingId}
                  </Link>
                ) : (
                  <span className="font-medium">Payment</span>
                )}
                <span className="block text-xs text-muted-foreground">
                  {e.propertyName ? `${e.propertyName} · ` : ''}
                  {day.format(new Date(e.paidAt))}
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                −{peso.format(e.paymongoFee)}
                <span className="block text-xs">
                  {formatPct(e.paymongoPct)}%
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                −{peso.format(e.platformFee)}
                <span className="block text-xs">
                  {formatPct(e.platformPct)}%
                </span>
              </td>
              <td className="px-3 py-2 text-right font-extrabold whitespace-nowrap tabular-nums text-foreground">
                {peso.format(e.net)}
              </td>
              <td className="px-3 py-2">
                <Badge
                  variant={e.status === 'paid_out' ? 'default' : 'secondary'}
                >
                  {e.withdrawable
                    ? 'Ready to withdraw'
                    : EARNING_STATE[e.status]}
                </Badge>
                {e.status === 'pending' && !e.withdrawable && e.availableAt && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Ready {day.format(new Date(e.availableAt))}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PAYOUT_STATE = {
  pending: { label: 'Waiting to be sent', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'secondary' },
  completed: { label: 'Sent', variant: 'default' },
  failed: { label: 'Not sent', variant: 'destructive' },
} as const

export function PayoutHistory({ payouts }: { payouts: PayoutView[] }) {
  if (payouts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You haven’t withdrawn anything yet.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border">
      {payouts.map((p) => (
        <li
          key={p.payoutId}
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
        >
          <div>
            <p className="font-bold text-foreground">{peso.format(p.amount)}</p>
            <p className="text-xs text-muted-foreground">
              {p.reference} · {day.format(new Date(p.requestedAt))}
              {p.methodLabel ? ` · ${p.methodLabel}` : ''}
            </p>
            {p.status === 'failed' && p.failureReason && (
              <p className="text-xs text-destructive">
                {p.failureReason} — the money is back in your balance.
              </p>
            )}
          </div>
          <Badge variant={PAYOUT_STATE[p.status].variant}>
            {PAYOUT_STATE[p.status].label}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
