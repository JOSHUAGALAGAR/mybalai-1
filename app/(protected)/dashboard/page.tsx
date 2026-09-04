import type { Metadata } from 'next'
import {
  Bell,
  CalendarRange,
  ClipboardList,
  CreditCard,
  MessageSquare,
  Search,
  Settings,
  Star,
} from 'lucide-react'

import { ModuleCard } from '@/components/dashboard/module-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireArea } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function TenantDashboardPage() {
  const user = await requireArea('tenant')
  const firstName = user.fullName?.split(' ')[0]

  return (
    <div>
      <PageHeader
        title={`Welcome${firstName ? `, ${firstName}` : ''}`}
        subtitle="Find a place, manage your bookings, and stay in touch with your landlord."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          title="Find a place"
          description="Browse and filter properties, then view rooms, beds, and rates."
          icon={Search}
          href="/discover"
        />
        <ModuleCard
          title="Bookings"
          description="Submit booking requests and track their status."
          icon={CalendarRange}
          href="/bookings"
        />
        <ModuleCard
          title="Payments"
          description="Record payments, upload receipts, and follow payment history."
          icon={CreditCard}
          href="/payments"
        />
        <ModuleCard
          title="Messages"
          description="Chat with landlords and caretakers about your rental."
          icon={MessageSquare}
          href="/messages"
        />
        <ModuleCard
          title="Inquiries"
          description="Questions you've asked landlords about properties."
          icon={ClipboardList}
          href="/inquiries"
        />
        <ModuleCard
          title="Reviews"
          description="Rate the places you've stayed and leave written reviews."
          icon={Star}
          href="/reviews"
        />
        <ModuleCard
          title="Notifications"
          description="Booking, payment, and message alerts in one place."
          icon={Bell}
          href="/notifications"
        />
        <ModuleCard
          title="Settings"
          description="Update your name and contact details."
          icon={Settings}
          href="/settings"
        />
      </div>
    </div>
  )
}
