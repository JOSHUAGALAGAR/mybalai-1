import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

import type { AdView } from '@/services/ads.service'

/** One advertisement, shown at the top of a role's dashboard. Marked "Ad" so it is never mistaken for content. */
export function AdBanner({ ad }: { ad: AdView }) {
  const external = ad.linkUrl ? /^https?:\/\//.test(ad.linkUrl) : false
  return (
    <aside
      aria-label="Advertisement"
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-primary-soft sm:flex-row"
    >
      {ad.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.imageUrl}
          alt=""
          className="h-36 w-full object-cover sm:h-auto sm:w-64 sm:shrink-0"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-4 sm:p-5">
        <span className="w-fit rounded-full bg-background px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          Ad
        </span>
        <p className="text-base font-extrabold text-foreground">{ad.title}</p>
        {ad.body && <p className="text-sm text-muted-foreground">{ad.body}</p>}
        {ad.linkUrl && (
          <Link
            href={ad.linkUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {ad.linkLabel || 'Learn more'}
            {external && <ExternalLink className="size-3.5" aria-hidden />}
          </Link>
        )}
      </div>
    </aside>
  )
}

export function AdBanners({ ads }: { ads: AdView[] }) {
  if (ads.length === 0) return null
  return (
    <div className="mb-6 space-y-3">
      {ads.map((ad) => (
        <AdBanner key={ad.adId} ad={ad} />
      ))}
    </div>
  )
}
