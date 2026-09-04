import type { Metadata } from 'next'
import Link from 'next/link'

import { PropertyCard } from '@/components/property/property-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { requireArea } from '@/lib/auth/dal'
import { canCreateProperty, isSuperadmin } from '@/lib/permissions/properties'
import { cn } from '@/lib/utils'
import {
  getPropertyFormOptions,
  listPropertiesForUser,
  type PropertyListScope,
} from '@/services/properties.service'

export const metadata: Metadata = { title: 'Properties' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function LandlordPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireArea('landlord', 'superadmin')
  const sp = await searchParams

  const canChooseScope = isSuperadmin(user)
  const scopeParam = Array.isArray(sp.scope) ? sp.scope[0] : sp.scope
  const scope: PropertyListScope =
    canChooseScope && scopeParam === 'mine' ? 'mine' : 'all'

  const [items, { types, statuses }] = await Promise.all([
    listPropertiesForUser(user, scope),
    getPropertyFormOptions(),
  ])

  const typeById = new Map(types.map((t) => [t.property_type_id, t.type_name]))
  const statusById = new Map(
    statuses.map((s) => [
      s.property_status_id,
      { code: s.status_code, name: s.status_name },
    ]),
  )

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle={`${items.length} ${items.length === 1 ? 'property' : 'properties'}`}
        actions={
          canCreateProperty(user) ? (
            <Button asChild>
              <Link href="/landlord/properties/new">Add property</Link>
            </Button>
          ) : undefined
        }
      />

      {canChooseScope && (
        <div className="mb-4 flex gap-1 text-sm">
          {(
            [
              ['All', '/landlord/properties', scope === 'all'],
              ['Mine', '/landlord/properties?scope=mine', scope === 'mine'],
            ] as const
          ).map(([label, href, active]) => (
            <Link
              key={label}
              href={href}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to start managing rooms, beds, and rates."
          action={
            <Button asChild>
              <Link href="/landlord/properties/new">Add property</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((property) => {
            const status =
              property.status_id != null
                ? statusById.get(property.status_id)
                : undefined
            return (
              <PropertyCard
                key={property.property_id}
                property={property}
                statusCode={status?.code ?? null}
                statusLabel={status?.name ?? null}
                typeLabel={
                  property.property_type_id != null
                    ? (typeById.get(property.property_type_id) ?? null)
                    : null
                }
                ownedByViewer={property.property_owner === user.legacyUserId}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
