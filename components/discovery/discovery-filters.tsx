import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nativeControlClass } from '@/components/ui/form-field'
import type { AmenityWithCategory } from '@/repositories/reference.repository'
import type { Tables } from '@/types/database'
import type { DiscoveryQuery } from '@/schemas/discovery'
import { DISCOVERY_SORTS } from '@/schemas/discovery'

const SORT_LABELS: Record<(typeof DISCOVERY_SORTS)[number], string> = {
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  name: 'Name (A–Z)',
}

export function DiscoveryFilters({
  types,
  amenities,
  current,
}: {
  types: Tables<'property_types'>[]
  amenities: AmenityWithCategory[]
  current: DiscoveryQuery
}) {
  const selected = new Set(current.amenities)
  const groups = new Map<string, AmenityWithCategory[]>()
  for (const a of amenities) {
    const key = a.category_name ?? 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  return (
    <form method="get" className="space-y-5 text-sm">
      <div className="space-y-1.5">
        <label htmlFor="q" className="font-medium">
          Search
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          placeholder="Name or address"
          defaultValue={current.q ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="type" className="font-medium">
          Property type
        </label>
        <select
          id="type"
          name="type"
          className={nativeControlClass}
          defaultValue={current.type ?? ''}
        >
          <option value="">Any</option>
          {types.map((t) => (
            <option key={t.property_type_id} value={t.property_type_id}>
              {t.type_name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <span className="font-medium">Monthly price (PHP)</span>
        <div className="flex items-center gap-2">
          <Input
            name="min"
            type="number"
            min={0}
            placeholder="Min"
            defaultValue={current.min ?? ''}
            aria-label="Minimum price"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            name="max"
            type="number"
            min={0}
            placeholder="Max"
            defaultValue={current.max ?? ''}
            aria-label="Maximum price"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sort" className="font-medium">
          Sort by
        </label>
        <select
          id="sort"
          name="sort"
          className={nativeControlClass}
          defaultValue={current.sort}
        >
          {DISCOVERY_SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {groups.size > 0 && (
        <fieldset className="space-y-2">
          <legend className="font-medium">Amenities</legend>
          {[...groups.entries()].map(([category, items]) => (
            <div key={category} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                {category}
              </p>
              {items.map((a) => (
                <label
                  key={a.amenity_id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="amenities"
                    value={a.amenity_id}
                    defaultChecked={selected.has(a.amenity_id)}
                    className="size-4 rounded border-input accent-primary"
                  />
                  {a.amenity_name}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}

      <div className="flex gap-2">
        <button type="submit" className={buttonVariants({ size: 'lg' })}>
          Apply
        </button>
        <Link
          href="/discover"
          className={buttonVariants({ variant: 'ghost', size: 'lg' })}
        >
          Clear
        </Link>
      </div>
    </form>
  )
}
