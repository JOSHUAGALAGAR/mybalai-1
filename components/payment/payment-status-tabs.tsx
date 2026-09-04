import Link from 'next/link'

import { cn } from '@/lib/utils'

const TABS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Pending', value: 'pending' },
  { label: 'Paid', value: 'paid' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Cancelled', value: 'cancelled' },
]

export function PaymentStatusTabs({
  basePath,
  active,
}: {
  basePath: string
  active: string | null
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 text-sm">
      {TABS.map((tab) => {
        const isActive = (tab.value ?? null) === (active ?? null)
        const href = tab.value ? `${basePath}?status=${tab.value}` : basePath
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              'rounded-md px-3 py-1.5 font-medium',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
