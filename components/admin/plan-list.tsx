import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { PlanView } from '@/services/subscriptions.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function PlanList({ plans }: { plans: PlanView[] }) {
  if (plans.length === 0) {
    return (
      <EmptyState
        title="No plans yet"
        description="Create a plan so landlord accounts can be put on a subscription."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Plan</th>
            <th className="px-3 py-2 font-medium">Properties</th>
            <th className="px-3 py-2 font-medium">Rooms/prop</th>
            <th className="px-3 py-2 font-medium">Beds/room</th>
            <th className="px-3 py-2 font-medium">Caretakers</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {plans.map((p) => (
            <tr key={p.plan_id} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/plans/${p.plan_id}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {p.name}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {p.code}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.max_properties}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.max_rooms_per_property}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.max_beds_per_room}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.max_caretakers}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.price > 0
                  ? `${peso.format(p.price)} / ${p.billing_interval_days}d`
                  : 'Free'}
              </td>
              <td className="px-3 py-2">
                {p.is_active ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">Hidden</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
