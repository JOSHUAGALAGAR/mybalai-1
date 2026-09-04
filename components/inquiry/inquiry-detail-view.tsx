import Link from 'next/link'

import { InquiryStatusBadge } from '@/components/inquiry/inquiry-status-badge'
import { RespondInquiryForm } from '@/components/inquiry/respond-inquiry-form'
import { Button } from '@/components/ui/button'
import type { InquiryDetail } from '@/services/inquiries.service'

export function InquiryDetailView({
  detail,
  mode,
}: {
  detail: InquiryDetail
  mode: { kind: 'tenant' } | { kind: 'manage'; backTo: string }
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {detail.subject}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.propertyName ?? `Property #${detail.propertyId}`}
            {mode.kind === 'manage' && detail.tenantName
              ? ` · ${detail.tenantName}`
              : ''}
            {` · ${new Date(detail.createdAt).toLocaleDateString()}`}
          </p>
        </div>
        <InquiryStatusBadge status={detail.status} />
      </div>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">Question</h2>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
          {detail.message}
        </p>
      </section>

      {detail.response ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Response{' '}
            {detail.responderRole && (
              <span className="font-normal text-muted-foreground capitalize">
                ({detail.responderRole})
              </span>
            )}
          </h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {detail.response}
          </p>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">No response yet.</p>
      )}

      {mode.kind === 'manage' && detail.canRespond && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            {detail.response ? 'Update response' : 'Respond'}
          </h2>
          <RespondInquiryForm
            inquiryId={detail.inquiryId}
            backTo={mode.backTo}
          />
        </section>
      )}

      <Button asChild variant="outline" size="sm">
        <Link
          href={`/messages/${mode.kind === 'tenant' ? detail.landlordId : detail.tenantId}?property=${detail.propertyId}`}
        >
          {mode.kind === 'tenant'
            ? 'Message the landlord'
            : 'Message the tenant'}
        </Link>
      </Button>

      {mode.kind === 'tenant' && (
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/inquiries">Back to inquiries</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
