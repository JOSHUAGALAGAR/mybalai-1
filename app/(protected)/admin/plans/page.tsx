import type { Metadata } from 'next'
import Link from 'next/link'

import { PlanList } from '@/components/admin/plan-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { listPlansForAdmin } from '@/services/subscriptions.service'

export const metadata: Metadata = { title: 'Subscription plans' }

export default async function AdminPlansPage() {
  await requireArea('superadmin')
  const plans = await listPlansForAdmin()

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to admin
      </Link>
      <PageHeader
        title="Subscription plans"
        subtitle={`${plans.length} ${plans.length === 1 ? 'plan' : 'plans'}`}
        actions={
          <Button asChild size="sm">
            <Link href="/admin/plans/new">New plan</Link>
          </Button>
        }
      />
      <PlanList plans={plans} />
    </div>
  )
}
