'use server'

import { revalidatePath } from 'next/cache'

import * as messaging from '@/services/messaging.service'
import { ServiceError } from '@/services/errors'

export type MessageActionState =
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | undefined

function toErrorState(error: unknown): MessageActionState {
  if (error instanceof ServiceError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors,
    }
  }
  console.error('[messages] action failed:', error)
  return { status: 'error', message: 'Message could not be sent.' }
}

export async function sendMessageAction(
  _prev: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  try {
    await messaging.sendMessage({
      receiver_id: formData.get('receiver_id'),
      property_id: formData.get('property_id'),
      reply_to_message_id: formData.get('reply_to_message_id'),
      message: formData.get('message'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  const other = String(formData.get('receiver_id'))
  const prop = String(formData.get('property_id') ?? '')
  revalidatePath('/messages')
  revalidatePath(`/messages/${other}`)
  void prop
  return undefined
}

export async function editMessageAction(
  _prev: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  try {
    await messaging.editMessage({
      message_id: formData.get('message_id'),
      message: formData.get('message'),
    })
  } catch (error) {
    return toErrorState(error)
  }
  revalidatePath('/messages')
  return undefined
}
