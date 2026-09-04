import type { Metadata } from 'next'
import Link from 'next/link'

import { createPlanAction } from '@/app/(protected)/admin/plans/actions'
import { PlanForm } from '@/components/admin/plan-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'New plan' }

export default async function NewPlanPage() {
  await requireArea('superadmin')

  return (
    <div className="space-y-6">
      <Link
        href="/admin/plans"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to plans
      </Link>
      <PageHeader title="New subscription plan" />
      <PlanForm action={createPlanAction} submitLabel="Create plan" />
    </div>
  )
}
