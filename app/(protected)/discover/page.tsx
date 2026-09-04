import type { Metadata } from 'next'

import { PageHeader } from '@/components/dashboard/page-header'
import { DiscoveryFilters } from '@/components/discovery/discovery-filters'
import { Pager } from '@/components/discovery/pager'
import { PropertyResultCard } from '@/components/discovery/property-result-card'
import { EmptyState } from '@/components/ui/empty-state'
import { discoveryQuerySchema } from '@/schemas/discovery'
import {
  getDiscoveryFilters,
  searchProperties,
} from '@/services/discovery.service'

export const metadata: Metadata = { title: 'Find a place' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const parsed = discoveryQuerySchema.safeParse(sp)
  const query = parsed.success ? parsed.data : discoveryQuerySchema.parse({})

  const [{ types, amenities }, results] = await Promise.all([
    getDiscoveryFilters(),
    searchProperties(query),
  ])

  return (
    <div>
      <PageHeader
        title="Find a place"
        subtitle={`${results.total} ${results.total === 1 ? 'property' : 'properties'}`}
      />

      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
        <aside className="mb-6 lg:mb-0">
          <DiscoveryFilters
            types={types}
            amenities={amenities}
            current={query}
          />
        </aside>

        <div>
          {results.items.length === 0 ? (
            <EmptyState
              title="No properties match your filters"
              description="Try widening your price range or clearing some filters."
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.items.map((item) => (
                  <PropertyResultCard key={item.propertyId} item={item} />
                ))}
              </div>
              <Pager
                page={results.page}
                pageCount={results.pageCount}
                params={sp}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
