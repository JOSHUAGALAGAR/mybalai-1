import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/dashboard/page-header'
import { StatusBadge } from '@/components/property/property-status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireArea } from '@/lib/auth/dal'
import { listMyAssignedProperties } from '@/services/caretakers.service'
import { getPropertyFormOptions } from '@/services/properties.service'

export const metadata: Metadata = { title: 'Assigned properties' }

export default async function CaretakerPropertiesPage() {
  await requireArea('caretaker', 'superadmin')
  const [properties, { statuses }] = await Promise.all([
    listMyAssignedProperties(),
    getPropertyFormOptions(),
  ])
  const statusById = new Map(
    statuses.map((s) => [
      s.property_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )

  return (
    <div>
      <PageHeader
        title="Assigned properties"
        subtitle="Properties a landlord has assigned to you."
      />

      {properties.length === 0 ? (
        <EmptyState
          title="Nothing assigned yet"
          description="When a landlord assigns you to a property, it appears here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {properties.map((p) => {
            const st =
              p.status_id != null ? statusById.get(p.status_id) : undefined
            return (
              <Link
                key={p.property_id}
                href={`/caretaker/properties/${p.property_id}`}
              >
                <Card className="h-full transition-colors hover:border-ring/60 hover:bg-muted/40">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {p.property_name}
                        </h3>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {p.address}
                        </p>
                      </div>
                      <StatusBadge
                        code={st?.code ?? null}
                        label={st?.name ?? null}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
