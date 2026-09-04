import type { Metadata } from 'next'
import {
  Building2,
  CalendarRange,
  ClipboardList,
  CreditCard,
  FileBarChart,
  MessageSquare,
  Settings,
  Star,
  Users,
  Wallet,
} from 'lucide-react'

import { ModuleCard } from '@/components/dashboard/module-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Landlord' }

export default async function LandlordOverviewPage() {
  const user = await requireArea('landlord', 'superadmin')
  const firstName = user.fullName?.split(' ')[0]

  return (
    <div>
      <PageHeader
        title={`Landlord${firstName ? ` · ${firstName}` : ''}`}
        subtitle="Your properties, bookings, payments, and caretaker team."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          title="Properties"
          description="Listings, rooms, beds, rental rates, and amenities — all in one place."
          icon={Building2}
          href="/landlord/properties"
        />
        <ModuleCard
          title="My plan"
          description="Your subscription, its limits, and how much you've used."
          icon={Wallet}
          href="/landlord/plan"
        />
        <ModuleCard
          title="Bookings"
          description="Review, approve, or reject tenant booking requests."
          icon={CalendarRange}
          href="/landlord/bookings"
        />
        <ModuleCard
          title="Caretakers"
          description="Create caretakers and assign them to specific properties."
          icon={Users}
          href="/landlord/caretakers"
        />
        <ModuleCard
          title="Payments"
          description="Verify tenant payments and add payment notes."
          icon={CreditCard}
          href="/landlord/payments"
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
          description="Occupancy, bookings, and revenue summaries."
          icon={FileBarChart}
          phase={12}
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
