'use server'

import { revalidatePath } from 'next/cache'

import * as notifications from '@/services/notifications.service'

export async function markNotificationReadAction(
  formData: FormData,
): Promise<void> {
  const id = Number(formData.get('id'))
  if (Number.isInteger(id) && id > 0) {
    await notifications.markNotificationRead(id)
  }
  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
}

export async function markAllNotificationsReadAction(): Promise<void> {
  await notifications.markAllNotificationsRead()
  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
}
