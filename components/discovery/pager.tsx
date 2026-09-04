import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Pager({
  page,
  pageCount,
  params,
}: {
  page: number
  pageCount: number
  /** current querystring params (without `page`) */
  params: Record<string, string | string[] | undefined>
}) {
  if (pageCount <= 1) return null

  const hrefFor = (target: number) => {
    const usp = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (key === 'page' || value == null) continue
      for (const v of Array.isArray(value) ? value : [value]) usp.append(key, v)
    }
    usp.set('page', String(target))
    return `/discover?${usp.toString()}`
  }

  return (
    <nav className="mt-8 flex items-center justify-between">
      <PagerLink
        href={hrefFor(page - 1)}
        disabled={page <= 1}
        label="Previous"
      />
      <span className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      <PagerLink
        href={hrefFor(page + 1)}
        disabled={page >= pageCount}
        label="Next"
      />
    </nav>
  )
}

function PagerLink({
  href,
  disabled,
  label,
}: {
  href: string
  disabled: boolean
  label: string
}) {
  const className = cn(buttonVariants({ variant: 'outline', size: 'lg' }))
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(className, 'pointer-events-none opacity-50')}
      >
        {label}
      </span>
    )
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  )
}
