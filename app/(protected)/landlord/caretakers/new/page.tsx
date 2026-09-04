import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { CaretakerForm } from '@/components/caretaker/caretaker-form'
import { requireArea } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Add caretaker' }

export default async function NewCaretakerPage() {
  await requireArea('landlord', 'superadmin')
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add caretaker"
        subtitle="Creates a caretaker sign-in. You'll assign properties next."
      />
      <CaretakerForm />
    </div>
  )
}
