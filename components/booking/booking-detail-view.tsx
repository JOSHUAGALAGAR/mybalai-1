import Link from 'next/link'

import { BookingStatusBadge } from '@/components/booking/booking-status-badge'
import { CancelBookingForm } from '@/components/booking/cancel-booking-form'
import { ManageBookingPanel } from '@/components/booking/manage-booking-panel'
import { PayBookingButton } from '@/components/booking/pay-booking-button'
import { Button } from '@/components/ui/button'
import type { BookingDetail } from '@/services/bookings.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function BookingDetailView({
  detail,
  mode,
  extras,
  onlinePaymentEnabled = false,
}: {
  detail: BookingDetail
  /** tenant view shows Cancel; manager view shows the transition panel. */
  mode: { kind: 'tenant' } | { kind: 'manage'; backTo: string }
  /** Extension list + CTAs, composed by each route. */
  extras?: React.ReactNode
  /** Show the tenant "Pay now" button when the booking is payment_pending. */
  onlinePaymentEnabled?: boolean
}) {
  const hasUpfront = detail.advanceAmount > 0 || detail.depositAmount > 0
  const rows: Array<[string, string | null]> = [
    ['Property', detail.propertyName],
    ['Room', detail.roomLabel],
    ['Bed', detail.bedNumber ? `Bed ${detail.bedNumber}` : null],
    ['Dates', `${detail.checkIn} → ${detail.checkOut}`],
    [
      'Rate',
      detail.unitPrice != null
        ? `${peso.format(detail.unitPrice)} / ${detail.period}`
        : null,
    ],
    ...(hasUpfront
      ? ([
          [
            'Rent',
            peso.format(
              detail.totalAmount - detail.advanceAmount - detail.depositAmount,
            ),
          ],
          detail.advanceAmount > 0
            ? ['1 month advance', peso.format(detail.advanceAmount)]
            : ['', null],
          detail.depositAmount > 0
            ? [
                '1 month deposit (refundable)',
                peso.format(detail.depositAmount),
              ]
            : ['', null],
        ] as Array<[string, string | null]>)
      : []),
    [
      hasUpfront ? 'Total to pay' : 'Estimated total',
      peso.format(detail.totalAmount),
    ],
    ['Submitted', new Date(detail.submittedAt).toLocaleDateString()],
    mode.kind === 'manage' ? ['Tenant', detail.tenantName ?? '—'] : ['', null],
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Booking #{detail.bookingId}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.propertyName}
          </p>
        </div>
        <BookingStatusBadge code={detail.statusCode} name={detail.statusName} />
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border bg-card">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-4"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm text-foreground">{value}</dd>
            </div>
          ))}
      </dl>

      {detail.message && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Message from tenant
          </h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {detail.message}
          </p>
        </section>
      )}
      {detail.landlordResponse && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Landlord response
          </h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {detail.landlordResponse}
          </p>
        </section>
      )}

      {(() => {
        const target =
          mode.kind === 'tenant' ? detail.propertyOwnerId : detail.tenantId
        return target ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/messages/${target}?property=${detail.propertyId}`}>
              {mode.kind === 'tenant'
                ? 'Message the landlord'
                : 'Message the tenant'}
            </Link>
          </Button>
        ) : null
      })()}

      {mode.kind === 'tenant' && detail.needsPayment && (
        <section>
          {onlinePaymentEnabled && detail.totalAmount >= 20 ? (
            <PayBookingButton
              bookingId={detail.bookingId}
              amount={detail.totalAmount}
              dueAt={detail.paymentDueAt}
            />
          ) : (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
              <p className="font-semibold text-foreground">Payment required</p>
              <p className="mt-1 text-muted-foreground">
                {peso.format(detail.totalAmount)} to confirm this booking
                {detail.paymentDueAt &&
                  ` by ${new Date(detail.paymentDueAt).toLocaleString()}`}
                .{' '}
                {onlinePaymentEnabled && detail.totalAmount < 20
                  ? 'Online payment needs at least ₱20 — record this one manually under Payments.'
                  : 'Record your payment under Payments so the landlord can verify it.'}
              </p>
            </div>
          )}
        </section>
      )}

      {extras}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Actions</h2>
        {mode.kind === 'tenant' ? (
          detail.canTenantCancel ? (
            <CancelBookingForm bookingId={detail.bookingId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No actions available for this booking.
            </p>
          )
        ) : (
          <ManageBookingPanel
            bookingId={detail.bookingId}
            allowed={detail.allowedTransitions}
            backTo={mode.backTo}
          />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">History</h2>
        <ol className="space-y-2">
          {detail.history.map((h, i) => (
            <li key={i} className="text-sm">
              <span className="text-muted-foreground">
                {new Date(h.at).toLocaleString()} —{' '}
              </span>
              <span className="text-foreground">
                {h.fromName ? `${h.fromName} → ` : ''}
                {h.toName}
              </span>
              {h.notes && (
                <span className="text-muted-foreground"> · {h.notes}</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
