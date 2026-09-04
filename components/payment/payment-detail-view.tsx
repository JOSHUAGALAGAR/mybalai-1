import { CancelPaymentForm } from '@/components/payment/cancel-payment-form'
import { DecidePaymentPanel } from '@/components/payment/decide-payment-panel'
import { PayOnlineButton } from '@/components/payment/pay-online-button'
import { PaymentNotes } from '@/components/payment/payment-notes'
import { PaymentStatusBadge } from '@/components/payment/payment-status-badge'
import { ReceiptUploader } from '@/components/payment/receipt-uploader'
import type { PaymentDetail } from '@/services/payments.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function PaymentDetailView({
  detail,
  mode,
  onlinePaymentEnabled = false,
}: {
  detail: PaymentDetail
  mode: { kind: 'tenant' } | { kind: 'manage'; backTo: string }
  /** Show the "Pay online" (PayMongo) button — tenant, pending payment. */
  onlinePaymentEnabled?: boolean
}) {
  const rows: Array<[string, string | null]> = [
    ['Amount', peso.format(detail.amount)],
    ['Method', detail.methodName],
    ['Reference', detail.reference],
    ['Property', detail.propertyName],
    ['Booking', detail.bookingId ? `#${detail.bookingId}` : null],
    [
      'Date paid',
      detail.paidAt ? new Date(detail.paidAt).toLocaleDateString() : null,
    ],
    ['Submitted', new Date(detail.submittedAt).toLocaleString()],
    mode.kind === 'manage' ? ['Payer', detail.payerName ?? '—'] : ['', null],
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Payment #{detail.paymentId}
          </h1>
          {detail.propertyName && (
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.propertyName}
            </p>
          )}
        </div>
        <PaymentStatusBadge code={detail.statusCode} name={detail.statusName} />
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

      {detail.note && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-foreground">Note</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {detail.note}
          </p>
        </section>
      )}

      {mode.kind === 'manage' && detail.canDecide && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Verification
          </h2>
          <DecidePaymentPanel
            paymentId={detail.paymentId}
            backTo={mode.backTo}
          />
        </section>
      )}

      {mode.kind === 'tenant' &&
        (detail.canCancel ||
          (onlinePaymentEnabled && detail.statusCode === 'pending')) && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Actions</h2>
            {onlinePaymentEnabled && detail.statusCode === 'pending' && (
              <PayOnlineButton paymentId={detail.paymentId} />
            )}
            {detail.canCancel && (
              <CancelPaymentForm paymentId={detail.paymentId} />
            )}
          </section>
        )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Receipts</h2>
        {detail.receipts.length > 0 ? (
          <ul className="mb-3 space-y-1 text-sm">
            {detail.receipts.map((r) => (
              <li key={r.id}>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {r.filename ?? 'Receipt'}
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    {r.filename ?? 'Receipt'} (link unavailable)
                  </span>
                )}
                <span className="text-muted-foreground">
                  {' '}
                  · {new Date(r.uploadedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">
            No receipts attached.
          </p>
        )}
        {(mode.kind === 'tenant' || detail.canManage) && (
          <ReceiptUploader paymentId={detail.paymentId} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Notes</h2>
        <PaymentNotes
          paymentId={detail.paymentId}
          notes={detail.notes}
          replies={detail.replies}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">History</h2>
        <ol className="space-y-1 text-sm">
          {detail.history.map((h, i) => (
            <li key={i}>
              <span className="text-muted-foreground">
                {new Date(h.at).toLocaleString()} —{' '}
              </span>
              <span className="text-foreground capitalize">{h.status}</span>
              {h.actorRole && (
                <span className="text-muted-foreground"> by {h.actorRole}</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
