import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { requireArea } from '@/lib/auth/dal'
import { listMyCaretakers } from '@/services/caretakers.service'

export const metadata: Metadata = { title: 'Caretakers' }

export default async function CaretakersPage() {
  await requireArea('landlord', 'superadmin')
  const caretakers = await listMyCaretakers()

  return (
    <div>
      <PageHeader
        title="Caretakers"
        subtitle="Delegate day-to-day operations for specific properties."
        actions={
          <Button asChild>
            <Link href="/landlord/caretakers/new">Add caretaker</Link>
          </Button>
        }
      />

      {caretakers.length === 0 ? (
        <EmptyState
          title="No caretakers yet"
          description="Create a caretaker account, then assign them to one or more of your properties."
          action={
            <Button asChild>
              <Link href="/landlord/caretakers/new">Add caretaker</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {caretakers.map((c) => (
            <li key={c.legacyUserId}>
              <Link
                href={`/landlord/caretakers/${c.legacyUserId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
              >
                <span>
                  <span className="text-sm font-medium text-foreground">
                    {c.fullName ?? c.email ?? `Caretaker #${c.legacyUserId}`}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.email}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.activeAssignments} assigned
                  {!c.isActive && ' · account disabled'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
