import { BadgeCheck, MessageSquare, Phone } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { ManagedTenant } from '@/services/landlord-tenants.service'

const GROUPS = [
  { phase: 'current', title: 'Staying now' },
  { phase: 'upcoming', title: 'Arriving soon' },
  { phase: 'past', title: 'Past tenants' },
] as const

const day = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })
const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})
const fmt = (iso: string) => day.format(new Date(`${iso}T00:00:00+08:00`))

export function TenantList({
  tenants,
  bookingsPath,
}: {
  tenants: ManagedTenant[]
  /** e.g. /landlord/bookings — each stay links to `${bookingsPath}/${bookingId}`. */
  bookingsPath: string
}) {
  if (tenants.length === 0) {
    return (
      <EmptyState
        title="No tenants yet"
        description="People appear here once a booking at one of your properties is confirmed and paid."
      />
    )
  }
  return (
    <div className="space-y-8">
      {GROUPS.map((group) => {
        const list = tenants.filter((t) => t.phase === group.phase)
        if (list.length === 0) return null
        return (
          <section key={group.phase} aria-label={group.title}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {group.title}{' '}
              <span className="font-normal text-muted-foreground">
                ({list.length})
              </span>
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {list.map((t) => (
                <li
                  key={t.tenantId}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground">
                        {t.name ?? `Tenant #${t.tenantId}`}
                        {t.idVerified && (
                          <Badge variant="default" className="gap-1">
                            <BadgeCheck className="size-3" aria-hidden />
                            ID verified
                          </Badge>
                        )}
                      </p>
                      {t.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {t.email}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 text-sm">
                      {t.phone && (
                        <a
                          href={`tel:${t.phone}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted"
                        >
                          <Phone className="size-3.5" aria-hidden />
                          {t.phone}
                        </a>
                      )}
                      <Link
                        href={`/messages/${t.tenantId}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
                      >
                        <MessageSquare className="size-3.5" aria-hidden />
                        Message
                      </Link>
                    </div>
                  </div>

                  <ul className="mt-3 divide-y divide-border border-t border-border text-sm">
                    {t.stays.map((s) => (
                      <li key={s.bookingId}>
                        <Link
                          href={`${bookingsPath}/${s.bookingId}`}
                          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 hover:text-primary"
                        >
                          <span className="min-w-0">
                            <span className="font-medium text-foreground">
                              {s.propertyName}
                            </span>
                            <span className="text-muted-foreground">
                              {' '}
                              · {s.roomLabel}
                              {s.bedNumber ? ` · Bed ${s.bedNumber}` : ''}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {fmt(s.checkIn)} → {fmt(s.checkOut)} ·{' '}
                            {peso.format(s.totalAmount)}
                            {s.statusName ? ` · ${s.statusName}` : ''}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
