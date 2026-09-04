import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  /** Present -> the card links here. */
  href?: string
  /** Present -> "Available in Phase N" tag, card is muted. */
  phase?: number
}

export function ModuleCard({
  title,
  description,
  icon: Icon,
  href,
  phase,
}: Props) {
  const body = (
    <Card
      className={cn(
        'h-full transition-colors',
        href
          ? 'hover:border-ring/60 hover:bg-muted/40'
          : 'border-dashed bg-muted/20',
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-md bg-muted',
              href ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" />
          </span>
          {phase ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Phase {phase}
            </span>
          ) : href ? (
            <ArrowRight className="size-4 text-muted-foreground" />
          ) : null}
        </div>
        <CardTitle className="mt-3 text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    )
  }
  return body
}
