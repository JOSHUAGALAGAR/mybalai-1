import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { RequestExtensionForm } from '@/components/extension/request-extension-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { getExtensionContext } from '@/services/extensions.service'
import { ServiceError } from '@/services/errors'

export const metadata: Metadata = { title: 'Request an extension' }

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default async function ExtendBookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  await requireArea('tenant', 'superadmin')
  const bookingId = Number((await params).bookingId)
  if (!Number.isInteger(bookingId) || bookingId <= 0) notFound()

  let ctx
  try {
    ctx = await getExtensionContext(bookingId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  }

  if (!ctx.canRequest) redirect(`/bookings/${bookingId}`)

  const rateHint =
    ctx.unitPrice != null && ctx.period
      ? `${peso.format(ctx.unitPrice)} / ${ctx.period}`
      : null

  return (
    <div className="space-y-6">
      <Link
        href={`/bookings/${bookingId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to booking
      </Link>
      <PageHeader
        title="Request an extension"
        subtitle="Ask your landlord to push out your check-out date."
      />
      <RequestExtensionForm
        bookingId={bookingId}
        currentCheckOut={ctx.currentCheckOut}
        minDate={nextDay(ctx.currentCheckOut)}
        rateHint={rateHint}
      />
    </div>
  )
}
