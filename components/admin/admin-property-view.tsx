import { StatusBadge } from '@/components/property/property-status-badge'
import { StarRating } from '@/components/discovery/star-rating'
import { Badge } from '@/components/ui/badge'
import type { AdminPropertyDetail } from '@/services/admin.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function AdminPropertyView({ detail }: { detail: AdminPropertyDetail }) {
  const { property, owner } = detail

  const facts: Array<[string, string | null]> = [
    ['Address', property.address],
    ['Type', detail.typeName],
    ['Contact number', property.contact_number],
    ['Monthly payment rule', property.monthly_payment_rule],
    ['Submitted', new Date(property.created_at).toLocaleString()],
    ['Last updated', new Date(property.updated_at).toLocaleString()],
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {property.property_name}
            </h1>
            <StatusBadge code={detail.statusCode} label={detail.statusName} />
            {property.is_verified && (
              <Badge variant="secondary">Verified</Badge>
            )}
            {property.is_featured && <Badge variant="outline">Featured</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Property #{property.property_id}
          </p>
        </div>
        <StarRating value={detail.ratings.avg} count={detail.ratings.count} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Owner</h2>
        <dl className="divide-y divide-border rounded-lg border border-border bg-card">
          <Row label="Name" value={detail.ownerName} />
          <Row label="Business" value={owner?.businessName ?? null} />
          <Row label="Email" value={owner?.email ?? null} />
          <Row
            label="Phone"
            value={owner?.contactNumber ?? owner?.phone ?? null}
          />
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Details</h2>
        <dl className="divide-y divide-border rounded-lg border border-border bg-card">
          {facts
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
        </dl>
      </section>

      {(property.description ||
        property.booking_policy ||
        property.house_rules) && (
        <section className="space-y-4">
          {property.description && (
            <Prose title="Description" body={property.description} />
          )}
          {property.booking_policy && (
            <Prose title="Booking policy" body={property.booking_policy} />
          )}
          {property.house_rules && (
            <Prose title="House rules" body={property.house_rules} />
          )}
        </section>
      )}

      {detail.amenities.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Amenities
          </h2>
          <div className="flex flex-wrap gap-1">
            {detail.amenities.map((a) => (
              <Badge key={a} variant="outline">
                {a}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Rooms ({detail.rooms.length})
        </h2>
        {detail.rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms listed.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {detail.rooms.map((room) => (
              <li key={room.roomId} className="px-4 py-3 text-sm">
                <span className="font-medium text-foreground">
                  {room.label}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  · {room.bedCount} bed{room.bedCount === 1 ? '' : 's'}
                </span>
                {room.rates.length > 0 && (
                  <span className="text-muted-foreground">
                    {' · '}
                    {room.rates
                      .map((r) => `${r.period} ${peso.format(r.price)}`)
                      .join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Subscription
        </h2>
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          Per-property subscriptions are not configured yet — coming in Phase
          11.
        </div>
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm wrap-break-word text-foreground">
        {value ?? '—'}
      </dd>
    </div>
  )
}

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
        {body}
      </p>
    </div>
  )
}
