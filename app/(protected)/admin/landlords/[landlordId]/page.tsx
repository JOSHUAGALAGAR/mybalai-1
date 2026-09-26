import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireArea } from '@/lib/auth/dal'
import { getLandlordForAdmin } from '@/services/admin.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Landlord' }

export default async function AdminLandlordPage({
  params,
}: {
  params: Promise<{ landlordId: string }>
}) {
  await requireArea('superadmin')
  const landlordId = Number((await params).landlordId)
  if (!Number.isInteger(landlordId) || landlordId <= 0) notFound()

  let data
  try {
    data = await getLandlordForAdmin(landlordId)
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === 'not_found' || error.code === 'validation')
    )
      notFound()
    throw error
  }
  const { user } = data

  return (
    <div className="space-y-6">
      <Link
        href="/admin/landlords"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to landlords
      </Link>
      <PageHeader
        title={user.fullName ?? `User #${user.legacyUserId}`}
        subtitle={user.email ?? undefined}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/users/${user.legacyUserId}`}>
              Account settings
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {user.isActive ? (
          <Badge variant="secondary">Enabled</Badge>
        ) : (
          <Badge variant="outline">Disabled</Badge>
        )}
        <span className="text-muted-foreground">
          {data.properties.length}{' '}
          {data.properties.length === 1 ? 'property' : 'properties'} ·{' '}
          {data.boostsBought} {data.boostsBought === 1 ? 'boost' : 'boosts'}{' '}
          bought
        </span>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Properties
        </h2>
        {data.properties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No properties yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.properties.map((p) => (
              <li key={p.propertyId}>
                <Link
                  href={`/admin/properties/${p.propertyId}`}
                  className="block px-4 py-3 hover:bg-muted/40"
                >
                  <span className="text-sm font-medium text-foreground">
                    {p.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {p.address}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
