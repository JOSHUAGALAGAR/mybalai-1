import Image from 'next/image'

import { cn } from '@/lib/utils'

/** The MyBalai mark (teal rounded square with the white "m") next to the wordmark — as in the mobile app. */
export function BrandLogo({
  size = 36,
  wordmark = true,
  className,
}: {
  size?: number
  wordmark?: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src="/brand-mark.png"
        alt={wordmark ? '' : 'MyBalai'}
        width={size}
        height={size}
        className="shrink-0"
        style={{ width: size, height: size }}
      />
      {wordmark && (
        <span
          className="font-extrabold tracking-wide text-foreground"
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          MYBALAI
        </span>
      )}
    </span>
  )
}
