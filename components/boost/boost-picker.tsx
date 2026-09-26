'use client'

import { Rocket } from 'lucide-react'
import { useActionState, useState } from 'react'

import {
  buyBoostAction,
  type BoostFormState,
} from '@/app/(protected)/landlord/boosts/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { nativeControlClass } from '@/components/ui/form-field'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { MyBoosts } from '@/services/boosts.service'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})
const day = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'Asia/Manila',
})

/** Pick a property and a boost length, then pay on PayMongo. */
export function BoostPicker({
  data,
  paymentsAvailable,
}: {
  data: MyBoosts
  paymentsAvailable: boolean
}) {
  const [state, action, pending] = useActionState<BoostFormState, FormData>(
    buyBoostAction,
    undefined,
  )
  const [propertyId, setPropertyId] = useState('')
  const [packageId, setPackageId] = useState(
    String(data.packages[0]?.packageId ?? ''),
  )
  const chosen = data.properties.find(
    (p) => String(p.propertyId) === propertyId,
  )

  if (data.properties.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Only approved (active) properties can be boosted. Once one of your
        properties is approved, you can boost it here.
      </p>
    )
  }
  if (data.packages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Boosts are not available right now. Please check back soon.
      </p>
    )
  }

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-border bg-card p-4"
      noValidate
    >
      {state?.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="property_id">Property to boost</Label>
        <select
          id="property_id"
          name="property_id"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className={nativeControlClass}
        >
          <option value="">Choose a property…</option>
          {data.properties.map((p) => (
            <option key={p.propertyId} value={p.propertyId}>
              {p.name}
              {p.liveUntil ? ' — boosted now' : ''}
            </option>
          ))}
        </select>
        {chosen?.liveUntil && (
          <p className="text-xs text-muted-foreground">
            It is already boosted until {day.format(new Date(chosen.liveUntil))}
            . A new boost starts right after.
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How long?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {data.packages.map((p) => (
            <label
              key={p.packageId}
              className={cn(
                'cursor-pointer rounded-2xl border p-3 text-sm transition-colors',
                packageId === String(p.packageId)
                  ? 'border-primary bg-primary-soft'
                  : 'border-border hover:bg-muted/40',
              )}
            >
              <input
                type="radio"
                name="package_id"
                value={p.packageId}
                checked={packageId === String(p.packageId)}
                onChange={() => setPackageId(String(p.packageId))}
                className="sr-only"
              />
              <span className="block text-base font-extrabold text-foreground">
                {peso.format(p.price)}
              </span>
              <span className="block font-semibold text-foreground">
                {p.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {p.days} days · ₱{(p.price / p.days).toFixed(0)}/day
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!paymentsAvailable && (
        <p className="text-sm text-muted-foreground">
          Online payments are not available yet, so boosts can’t be bought.
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={pending || !paymentsAvailable || !propertyId}
        aria-busy={pending}
      >
        <Rocket className="size-4" aria-hidden />
        {pending ? 'Opening payment…' : 'Boost and pay'}
      </Button>
    </form>
  )
}
