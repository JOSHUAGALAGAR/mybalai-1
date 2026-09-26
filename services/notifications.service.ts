import 'server-only'

import { requireUser } from '@/lib/auth/dal'
import { primaryRole } from '@/lib/auth/roles'
import * as messagingRepo from '@/repositories/messaging.repository'

export type NotificationItem = {
  id: number
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
  href: string | null
}

function linkFor(
  role: string,
  referenceType: string | null,
  referenceId: number | null,
): string | null {
  if (!referenceType || referenceId == null) return null
  const managerArea = role === 'caretaker' ? '/caretaker' : '/landlord'
  switch (referenceType) {
    case 'booking':
      return role === 'tenant'
        ? `/bookings/${referenceId}`
        : `${managerArea}/bookings/${referenceId}`
    case 'payment':
      return role === 'tenant'
        ? `/payments/${referenceId}`
        : `${managerArea}/payments/${referenceId}`
    case 'inquiry':
      return role === 'tenant'
        ? `/inquiries/${referenceId}`
        : `${managerArea}/inquiries/${referenceId}`
    case 'message':
      return '/messages'
    case 'review':
      return role === 'tenant' ? '/reviews' : `${managerArea}/reviews`
    case 'boost':
      return '/landlord/boosts'
    case 'payout':
      return '/landlord/earnings'
    default:
      return null
  }
}

/** Notifications with the raw reference, so the mobile app can open the right screen. */
export type MobileNotification = Omit<NotificationItem, 'href'> & {
  referenceType: string | null
  referenceId: number | null
}

export async function listMyNotifications(): Promise<MobileNotification[]> {
  const user = await requireUser()
  const rows = await messagingRepo.listNotifications(user.legacyUserId)
  return rows.map((n) => ({
    id: n.notification_id,
    type: n.notification_type,
    title: n.title,
    message: n.message,
    isRead: n.is_read,
    createdAt: n.created_at,
    referenceType: n.reference_type,
    referenceId: n.reference_id,
  }))
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const user = await requireUser()
  const role = primaryRole(user.roles)
  const rows = await messagingRepo.listNotifications(user.legacyUserId)
  return rows.map((n) => ({
    id: n.notification_id,
    type: n.notification_type,
    title: n.title,
    message: n.message,
    isRead: n.is_read,
    createdAt: n.created_at,
    href: linkFor(role, n.reference_type, n.reference_id),
  }))
}

export async function getUnreadCount(): Promise<number> {
  const user = await requireUser()
  return messagingRepo.countUnreadNotifications(user.legacyUserId)
}

export async function markNotificationRead(id: number): Promise<void> {
  const user = await requireUser()
  await messagingRepo.markNotificationRead(user.legacyUserId, id)
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser()
  await messagingRepo.markAllNotificationsRead(user.legacyUserId)
}
