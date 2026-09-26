import type { Metadata } from 'next'
import {
  Building2,
  CalendarRange,
  ClipboardList,
  CreditCard,
  MessageSquare,
  Settings,
  Users,
} from 'lucide-react'

import { AdBanners } from '@/components/ads/ad-banner'
import { ModuleCard } from '@/components/dashboard/module-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { liveAdsForCurrentUser } from '@/services/ads.service'

export const metadata: Metadata = { title: 'Caretaker' }

export default async function CaretakerOverviewPage() {
  const user = await requireArea('caretaker', 'superadmin')
  const firstName = user.fullName?.split(' ')[0]
  const ads = await liveAdsForCurrentUser()

  return (
    <div>
      <PageHeader
        title={`Caretaker${firstName ? ` · ${firstName}` : ''}`}
        subtitle="Operations for the properties assigned to you."
      />

      <AdBanners ads={ads} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          title="Assigned properties"
          description="Property details, rooms, beds, and operational status updates."
          icon={Building2}
          href="/caretaker/properties"
        />
        <ModuleCard
          title="Bookings"
          description="Assist with bookings for assigned properties."
          icon={CalendarRange}
          href="/caretaker/bookings"
        />
        <ModuleCard
          title="Payments"
          description="View payments for assigned properties and add notes."
          icon={CreditCard}
          href="/caretaker/payments"
        />
        <ModuleCard
          title="Tenants"
          description="Who is staying at your assigned properties, with contacts."
          icon={Users}
          href="/caretaker/tenants"
        />
        <ModuleCard
          title="Inquiries"
          description="Handle property inquiries for assigned properties."
          icon={ClipboardList}
          href="/caretaker/inquiries"
        />
        <ModuleCard
          title="Messages"
          description="Message tenants for assigned properties."
          icon={MessageSquare}
          href="/messages"
        />
        <ModuleCard
          title="Settings"
          description="Update your profile details."
          icon={Settings}
          href="/settings"
        />
      </div>
    </div>
  )
}
