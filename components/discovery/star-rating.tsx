import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

export function StarRating({
  value,
  count,
  size = 'sm',
}: {
  value: number | null
  count?: number
  size?: 'sm' | 'md'
}) {
  const dim = size === 'md' ? 'size-4' : 'size-3.5'

  if (value === null) {
    return <span className="text-xs text-muted-foreground">No reviews yet</span>
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              dim,
              n <= Math.round(value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/40',
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {value.toFixed(1)}
        {count !== undefined && ` (${count})`}
      </span>
    </span>
  )
}
