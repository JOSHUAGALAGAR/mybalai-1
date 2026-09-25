import Link from 'next/link'

export type BarRow = {
  key: string
  label: string
  /** Bar length, in the same unit as `max`. */
  value: number
  /** Value shown at the tip of the bar. */
  display: string
  /** Extra detail on hover. */
  hint?: string
  href?: string
}

/**
 * Horizontal bars: label above, value at the tip, a lighter step of the same
 * hue as the track. Single series, so no legend.
 */
export function BarList({
  rows,
  max,
  ariaLabel,
}: {
  rows: BarRow[]
  max: number
  ariaLabel: string
}) {
  return (
    <ul className="flex flex-col gap-3" aria-label={ariaLabel}>
      {rows.map((row) => {
        const pct = max > 0 ? Math.min(100, (row.value / max) * 100) : 0
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">
                {row.label}
              </span>
              <span className="shrink-0 font-medium text-foreground tabular-nums">
                {row.display}
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-viz-track">
              <div
                className="h-full rounded-full bg-viz-1"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )
        return (
          <li key={row.key} title={row.hint}>
            {row.href ? (
              <Link
                href={row.href}
                className="block rounded-md outline-offset-4 hover:opacity-80"
              >
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        )
      })}
    </ul>
  )
}
