import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { VerificationReview } from '@/components/admin/verification-review'
import { PageHeader } from '@/components/dashboard/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { requireArea } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import { getVerificationForAdmin } from '@/services/verification.service'

export const metadata: Metadata = { title: 'Review ID' }
// The picture links expire after a minute, so this page is never cached.
export const dynamic = 'force-dynamic'

export default async function AdminVerificationDetailPage({
  params,
}: {
  params: Promise<{ verificationId: string }>
}) {
  await requireArea('superadmin')
  const id = Number((await params).verificationId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  let v
  try {
    v = await getVerificationForAdmin(id)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  const rows: Array<[string, string | null]> = [
    ['Name on account', v.name],
    ['Email', v.email],
    ['Phone', v.phone],
    ['ID type', v.idTypeLabel],
    ['Submitted', new Date(v.submittedAt).toLocaleString()],
    ['Reviewed', v.reviewedAt ? new Date(v.reviewedAt).toLocaleString() : null],
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/admin/verifications"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to ID verification
      </Link>
      <PageHeader title={`ID from ${v.name}`} subtitle={v.idTypeLabel} />

      <div className="flex flex-wrap items-center gap-2">
        {v.status === 'pending' && (
          <Badge variant="secondary">Waiting for review</Badge>
        )}
        {v.status === 'approved' && <Badge>Verified</Badge>}
        {v.status === 'rejected' && (
          <Badge variant="destructive">Rejected</Badge>
        )}
      </div>

      {v.status === 'rejected' && v.rejectReason && (
        <Alert>
          <AlertDescription>Reason given: {v.rejectReason}</AlertDescription>
        </Alert>
      )}

      <dl className="divide-y divide-border rounded-lg border border-border bg-card">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm text-foreground">{value}</dd>
            </div>
          ))}
      </dl>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">The ID</h2>
        <p className="text-muted-foreground text-xs">
          Private pictures. These links stop working after about a minute —
          reload the page for fresh ones. Do not share or download them.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['Front', v.frontUrl],
              ['Back', v.backUrl],
            ] as const
          ).map(([label, url]) => (
            <figure key={label} className="space-y-1.5">
              <figcaption className="text-sm font-medium">{label}</figcaption>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${label} of the ID`}
                    referrerPolicy="no-referrer"
                    className="max-h-[420px] w-full rounded-lg border border-border bg-muted object-contain"
                  />
                </a>
              ) : (
                <p className="text-destructive rounded-lg border border-dashed p-6 text-center text-sm">
                  This picture could not be loaded. Reload the page, or ask the
                  tenant to upload it again.
                </p>
              )}
            </figure>
          ))}
        </div>
      </section>

      {v.status === 'pending' && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Decision</h2>
          <VerificationReview verificationId={v.verificationId} />
        </section>
      )}
    </div>
  )
}
