import Link from 'next/link'

import {
  deleteAdAction,
  toggleAdAction,
} from '@/app/(protected)/admin/ads/actions'
import { ConfirmButton } from '@/components/property/confirm-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { roleLabel, type AdStatus } from '@/lib/ads/rules'
import type { AdView } from '@/services/ads.service'

const STATUS: Record<
  AdStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'outline' | 'destructive'
  }
> = {
  live: { label: 'Live', variant: 'default' },
  scheduled: { label: 'Scheduled', variant: 'secondary' },
  ended: { label: 'Ended', variant: 'outline' },
  paused: { label: 'Paused', variant: 'outline' },
}

const day = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'Asia/Manila',
})

function window(ad: AdView): string {
  if (!ad.startsAt && !ad.endsAt) return 'Always'
  const from = ad.startsAt ? day.format(new Date(ad.startsAt)) : 'now'
  const to = ad.endsAt ? day.format(new Date(ad.endsAt)) : 'no end'
  return `${from} → ${to}`
}

export function AdList({ ads }: { ads: AdView[] }) {
  if (ads.length === 0) {
    return (
      <EmptyState
        title="No ads yet"
        description="Create an ad to show a banner on the dashboards of tenants, landlords or caretakers."
      />
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Ad</th>
            <th className="px-3 py-2 font-medium">Shown to</th>
            <th className="px-3 py-2 font-medium">Runs</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ads.map((ad) => {
            const st = STATUS[ad.status]
            return (
              <tr key={ad.adId} className="align-middle hover:bg-muted/30">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    {ad.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ad.imageUrl}
                        alt=""
                        className="h-10 w-16 rounded-md object-cover"
                      />
                    )}
                    <Link
                      href={`/admin/ads/${ad.adId}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {ad.title}
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {ad.targetRoles.map(roleLabel).join(', ')}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {window(ad)}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={st.variant}>{st.label}</Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <form action={toggleAdAction}>
                      <input type="hidden" name="ad_id" value={ad.adId} />
                      <input
                        type="hidden"
                        name="is_active"
                        value={ad.isActive ? 'false' : 'true'}
                      />
                      <Button type="submit" size="sm" variant="ghost">
                        {ad.isActive ? 'Pause' : 'Resume'}
                      </Button>
                    </form>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/ads/${ad.adId}`}>Edit</Link>
                    </Button>
                    <ConfirmButton
                      action={deleteAdAction}
                      confirm={`Delete “${ad.title}”? This cannot be undone.`}
                      hidden={{ ad_id: ad.adId }}
                      variant="ghost"
                      size="sm"
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
