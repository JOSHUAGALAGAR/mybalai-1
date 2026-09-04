import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/dashboard/page-header'
import { AssignmentEditor } from '@/components/caretaker/assignment-editor'
import { requireArea } from '@/lib/auth/dal'
import { ServiceError } from '@/services/errors'
import { getCaretakerDetail } from '@/services/caretakers.service'

export const metadata: Metadata = { title: 'Caretaker' }

export default async function CaretakerDetailPage({
  params,
}: {
  params: Promise<{ caretakerId: string }>
}) {
  await requireArea('landlord', 'superadmin')
  const caretakerId = Number((await params).caretakerId)
  if (!Number.isInteger(caretakerId) || caretakerId <= 0) notFound()

  let detail
  try {
    detail = await getCaretakerDetail(caretakerId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'validation')
    ) {
      notFound()
    }
    throw error
  }

  const { account, properties } = detail

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/landlord/caretakers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to caretakers
        </Link>
      </div>

      <PageHeader
        title={
          account.fullName ??
          account.email ??
          `Caretaker #${account.legacyUserId}`
        }
        subtitle={account.email ?? undefined}
      />

      <section>
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Property assignments
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The caretaker can view and run operations only for the properties
          checked below.
        </p>
        <AssignmentEditor
          caretakerId={account.legacyUserId}
          properties={properties}
        />
      </section>
    </div>
  )
}
