import {
  Banknote,
  Building2,
  CalendarRange,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileText,
  Home,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  ScrollText,
  Rocket,
  Search,
  Settings,
  Smartphone,
  ShieldCheck,
  Star,
  Users,
  Bell,
} from 'lucide-react'

import type { AppRole } from '@/lib/auth/roles'
import { primaryRole } from '@/lib/auth/roles'

export type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Feature not built yet — rendered disabled with a "Soon" tag. */
  soon?: boolean
  /** Match child routes too (default: exact). */
  match?: 'exact' | 'startsWith'
}

export type NavSection = {
  label?: string
  items: NavItem[]
}

const TENANT_NAV: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      {
        href: '/discover',
        label: 'Find a place',
        icon: Search,
        match: 'startsWith',
      },
      {
        href: '/bookings',
        label: 'Bookings',
        icon: CalendarRange,
        match: 'startsWith',
      },
      {
        href: '/payments',
        label: 'Payments',
        icon: CreditCard,
        match: 'startsWith',
      },
      {
        href: '/messages',
        label: 'Messages',
        icon: MessageSquare,
        match: 'startsWith',
      },
      {
        href: '/inquiries',
        label: 'Inquiries',
        icon: ClipboardList,
        match: 'startsWith',
      },
      {
        href: '/reviews',
        label: 'Reviews',
        icon: Star,
        match: 'startsWith',
      },
      {
        href: '/notifications',
        label: 'Notifications',
        icon: Bell,
        match: 'startsWith',
      },
    ],
  },
  {
    label: 'Account',
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
]

const LANDLORD_NAV: NavSection[] = [
  {
    items: [
      { href: '/landlord', label: 'Overview', icon: Home },
      {
        href: '/landlord/properties',
        label: 'Properties',
        icon: Building2,
        match: 'startsWith',
      },
      {
        href: '/landlord/bookings',
        label: 'Bookings',
        icon: CalendarRange,
        match: 'startsWith',
      },
      {
        href: '/landlord/tenants',
        label: 'Tenants',
        icon: Users,
        match: 'startsWith',
      },
      {
        href: '/landlord/caretakers',
        label: 'Caretakers',
        icon: Users,
        match: 'startsWith',
      },
      {
        href: '/landlord/payments',
        label: 'Payments',
        icon: CreditCard,
        match: 'startsWith',
      },
      {
        href: '/landlord/boosts',
        label: 'Boost',
        icon: Rocket,
        match: 'startsWith',
      },
      {
        href: '/landlord/earnings',
        label: 'Earnings',
        icon: Banknote,
        match: 'startsWith',
      },
      {
        href: '/landlord/reviews',
        label: 'Reviews',
        icon: Star,
        match: 'startsWith',
      },
      {
        href: '/landlord/reports',
        label: 'Reports',
        icon: FileBarChart,
        match: 'startsWith',
      },
      {
        href: '/landlord/inquiries',
        label: 'Inquiries',
        icon: ClipboardList,
        match: 'startsWith',
      },
      {
        href: '/messages',
        label: 'Messages',
        icon: MessageSquare,
        match: 'startsWith',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        href: '/notifications',
        label: 'Notifications',
        icon: Bell,
        match: 'startsWith',
      },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const CARETAKER_NAV: NavSection[] = [
  {
    items: [
      { href: '/caretaker', label: 'Overview', icon: Home },
      {
        href: '/caretaker/properties',
        label: 'Assigned properties',
        icon: Building2,
        match: 'startsWith',
      },
      {
        href: '/caretaker/bookings',
        label: 'Bookings',
        icon: CalendarRange,
        match: 'startsWith',
      },
      {
        href: '/caretaker/payments',
        label: 'Payments',
        icon: CreditCard,
        match: 'startsWith',
      },
      {
        href: '/caretaker/tenants',
        label: 'Tenants',
        icon: Users,
        match: 'startsWith',
      },
      {
        href: '/caretaker/inquiries',
        label: 'Inquiries',
        icon: ClipboardList,
        match: 'startsWith',
      },
      {
        href: '/messages',
        label: 'Messages',
        icon: MessageSquare,
        match: 'startsWith',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        href: '/notifications',
        label: 'Notifications',
        icon: Bell,
        match: 'startsWith',
      },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const SUPERADMIN_NAV: NavSection[] = [
  {
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard },
      {
        href: '/admin/properties',
        label: 'Property listings',
        icon: Building2,
        match: 'startsWith',
      },
      {
        href: '/admin/applications',
        label: 'Applications',
        icon: FileText,
        match: 'startsWith',
      },
      {
        href: '/admin/landlords',
        label: 'Landlords',
        icon: Building2,
        match: 'startsWith',
      },
      {
        href: '/admin/verifications',
        label: 'ID verification',
        icon: ShieldCheck,
        match: 'startsWith',
      },
      {
        href: '/admin/users',
        label: 'Users',
        icon: Users,
        match: 'startsWith',
      },
      {
        href: '/admin/bookings',
        label: 'Bookings',
        icon: CalendarRange,
        match: 'startsWith',
      },
      {
        href: '/admin/payments',
        label: 'Payments',
        icon: CreditCard,
        match: 'startsWith',
      },
      {
        href: '/admin/boosts',
        label: 'Boosts',
        icon: Rocket,
        match: 'startsWith',
      },
      {
        href: '/admin/payouts',
        label: 'Payouts & fees',
        icon: Banknote,
        match: 'startsWith',
      },
      {
        href: '/admin/reports',
        label: 'Reports',
        icon: FileBarChart,
        match: 'startsWith',
      },
      {
        href: '/admin/ads',
        label: 'Portal ads',
        icon: Megaphone,
        match: 'startsWith',
      },
      {
        href: '/admin/app',
        label: 'Android app',
        icon: Smartphone,
        match: 'startsWith',
      },
      {
        href: '/admin/audit-logs',
        label: 'Audit logs',
        icon: ScrollText,
        match: 'startsWith',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        href: '/messages',
        label: 'Messages',
        icon: MessageSquare,
        match: 'startsWith',
      },
      {
        href: '/notifications',
        label: 'Notifications',
        icon: Bell,
        match: 'startsWith',
      },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const NAV_BY_ROLE: Record<AppRole, NavSection[]> = {
  tenant: TENANT_NAV,
  landlord: LANDLORD_NAV,
  caretaker: CARETAKER_NAV,
  superadmin: SUPERADMIN_NAV,
}

export function navForRoles(roles: readonly AppRole[]): NavSection[] {
  return NAV_BY_ROLE[primaryRole(roles)]
}
