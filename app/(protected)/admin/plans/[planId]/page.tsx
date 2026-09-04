import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { updatePlanAction } from '@/app/(protected)/admin/plans/actions'
import { PlanForm } from '@/components/admin/plan-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { getPlanForAdmin } from '@/services/subscriptions.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Edit plan' }

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>
}) {
  await requireArea('superadmin')
  const planId = Number((await params).planId)
  if (!Number.isInteger(planId) || planId <= 0) notFound()

  let plan
  try {
    plan = await getPlanForAdmin(planId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/plans"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to plans
      </Link>
      <PageHeader title={`Edit plan · ${plan.name}`} />
      <PlanForm
        action={updatePlanAction}
        planId={plan.plan_id}
        submitLabel="Save plan"
        initial={{
          code: plan.code,
          name: plan.name,
          description: plan.description ?? '',
          max_properties: String(plan.max_properties),
          max_rooms_per_property: String(plan.max_rooms_per_property),
          max_beds_per_room: String(plan.max_beds_per_room),
          max_caretakers: String(plan.max_caretakers),
          price: String(plan.price),
          billing_interval_days: String(plan.billing_interval_days),
          sort_order: String(plan.sort_order),
          is_active: plan.is_active ? 'on' : '',
        }}
      />
    </div>
  )
}
