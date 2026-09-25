import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: string
  /** Secondary line under the value (a delta, a count, a caption). */
  footnote?: React.ReactNode
  /** Present -> the whole tile links here. */
  href?: string
}

export function StatTile({ label, value, footnote, href }: Props) {
  const body = (
    <Card
      size="sm"
      className={cn('h-full', href && 'transition-colors hover:bg-muted/40')}
    >
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {footnote && (
          <div className="text-xs text-muted-foreground">{footnote}</div>
        )}
      </CardContent>
    </Card>
  )
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Signed % change vs a named period. Icon + sign carry direction, not colour alone. */
export function Delta({ pct, versus }: { pct: number | null; versus: string }) {
  if (pct === null) return <span>No {versus} to compare</span>
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium',
          up ? 'text-viz-good' : 'text-destructive',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {up ? '+' : '−'}
        {Math.abs(pct).toFixed(0)}%
      </span>
      <span>vs {versus}</span>
    </span>
  )
}
