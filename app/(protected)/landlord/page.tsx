import type { Metadata } from 'next'
import {
  Banknote,
  Building2,
  Rocket,
  CalendarRange,
  ClipboardList,
  CreditCard,
  FileBarChart,
  MessageSquare,
  Settings,
  Star,
  UserCog,
  Users,
} from 'lucide-react'

import { AdBanners } from '@/components/ads/ad-banner'
import { LandlordInsights } from '@/components/dashboard/landlord-insights'
import { ModuleCard } from '@/components/dashboard/module-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'
import { liveAdsForCurrentUser } from '@/services/ads.service'
import {
  getLandlordDashboard,
  type LandlordDashboard,
} from '@/services/landlord-dashboard.service'

export const metadata: Metadata = { title: 'Landlord' }

// The metrics are a convenience layer; if they fail to load the module links
// below must still render.
async function loadDashboard(): Promise<LandlordDashboard | null> {
  try {
    return await getLandlordDashboard()
  } catch (error) {
    console.error('Landlord dashboard metrics failed to load', error)
    return null
  }
}

export default async function LandlordOverviewPage() {
  const user = await requireArea('landlord', 'superadmin')
  const firstName = user.fullName?.split(' ')[0]
  const [dashboard, ads] = await Promise.all([
    loadDashboard(),
    liveAdsForCurrentUser(),
  ])

  return (
    <div>
      <PageHeader
        title={`Landlord${firstName ? ` · ${firstName}` : ''}`}
        subtitle="Your properties, bookings, payments, and caretaker team."
      />

      <AdBanners ads={ads} />

      {dashboard && <LandlordInsights data={dashboard} />}

      <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
        Manage
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          title="Properties"
          description="Listings, rooms, beds, rental rates, and amenities — all in one place."
          icon={Building2}
          href="/landlord/properties"
        />
        <ModuleCard
          title="Boost"
          description="Optional: show a property first in search for a few days."
          icon={Rocket}
          href="/landlord/boosts"
        />
        <ModuleCard
          title="Bookings"
          description="Review, approve, or reject tenant booking requests."
          icon={CalendarRange}
          href="/landlord/bookings"
        />
        <ModuleCard
          title="Tenants"
          description="Who is staying, arriving soon, or has stayed — with contacts."
          icon={Users}
          href="/landlord/tenants"
        />
        <ModuleCard
          title="Caretakers"
          description="Create caretakers and assign them to specific properties."
          icon={UserCog}
          href="/landlord/caretakers"
        />
        <ModuleCard
          title="Payments"
          description="Verify tenant payments and add payment notes."
          icon={CreditCard}
          href="/landlord/payments"
        />
        <ModuleCard
          title="Earnings"
          description="Your net earnings after fees, and withdrawals."
          icon={Banknote}
          href="/landlord/earnings"
        />
        <ModuleCard
          title="Inquiries"
          description="Questions tenants ask about your properties."
          icon={ClipboardList}
          href="/landlord/inquiries"
        />
        <ModuleCard
          title="Messages"
          description="Chat with tenants and your caretakers."
          icon={MessageSquare}
          href="/messages"
        />
        <ModuleCard
          title="Reviews"
          description="See tenant ratings and respond to reviews."
          icon={Star}
          href="/landlord/reviews"
        />
        <ModuleCard
          title="Reports"
          description="Occupancy, bookings, and revenue — with CSV exports."
          icon={FileBarChart}
          href="/landlord/reports"
        />
        <ModuleCard
          title="Settings"
          description="Update your business and contact details."
          icon={Settings}
          href="/settings"
        />
      </div>
    </div>
  )
}
