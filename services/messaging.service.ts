import 'server-only'

import { requireUser, type CurrentUser } from '@/lib/auth/dal'
import { isSuperadmin } from '@/lib/permissions/properties'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as caretakersRepo from '@/repositories/caretakers.repository'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import * as usersRepo from '@/repositories/users.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { editMessageSchema, sendMessageSchema } from '@/schemas/messaging'

async function isPropertyManager(
  userId: number,
  roleCodes: string[],
  propertyId: number,
): Promise<boolean> {
  if (roleCodes.includes('landlord')) {
    const property = await propertiesRepo.getProperty(propertyId)
    if (property?.property_owner === userId) return true
  }
  if (roleCodes.includes('caretaker')) {
    if (await caretakersRepo.isPropertyAssigned(userId, propertyId)) return true
  }
  return false
}

async function canMessage(
  me: CurrentUser,
  counterpartyId: number,
  propertyId: number,
): Promise<boolean> {
  if (counterpartyId === me.legacyUserId) return false
  if (isSuperadmin(me)) return true

  const other = await usersRepo.getAccountById(counterpartyId)
  if (!other) return false
  const otherRoles = await usersRepo.getRoleCodes(counterpartyId)

  const meManages = await isPropertyManager(
    me.legacyUserId,
    me.roles,
    propertyId,
  )
  const otherManages = await isPropertyManager(
    counterpartyId,
    otherRoles,
    propertyId,
  )

  // manager <-> a tenant linked (booking or inquiry) to that property
  if (
    meManages &&
    otherRoles.includes('tenant') &&
    (await messagingRepo.tenantIsLinkedToProperty(counterpartyId, propertyId))
  ) {
    return true
  }
  if (
    otherManages &&
    me.roles.includes('tenant') &&
    (await messagingRepo.tenantIsLinkedToProperty(me.legacyUserId, propertyId))
  ) {
    return true
  }
  return false
}

export type ConversationMeta = {
  otherUserId: number
  otherName: string | null
  propertyId: number
  propertyName: string | null
}

export type ChatMessage = {
  messageId: number
  mine: boolean
  senderName: string | null
  body: string
  isEdited: boolean
  createdAt: string
  replyTo: { body: string; senderName: string | null } | null
}

export async function getConversation(
  otherUserId: number,
  propertyId: number,
): Promise<{ meta: ConversationMeta; messages: ChatMessage[] }> {
  const me = await requireUser()

  const rows = await messagingRepo.listConversation(
    me.legacyUserId,
    otherUserId,
    propertyId,
  )

  // Allow if there is already a thread, otherwise check the relationship.
  if (rows.length === 0 && !(await canMessage(me, otherUserId, propertyId))) {
    throw new ServiceError('Conversation not available.', 'not_found')
  }

  await messagingRepo.markConversationRead(
    me.legacyUserId,
    otherUserId,
    propertyId,
  )

  const [names, propNames] = await Promise.all([
    bookingsRepo.tenantNamesByIds([
      otherUserId,
      ...rows.map((r) => r.sender_id),
    ]),
    bookingsRepo.propertyNamesByIds([propertyId]),
  ])
  const byId = new Map(rows.map((r) => [r.message_id, r]))

  const messages: ChatMessage[] = rows.map((r) => {
    const parent = r.reply_to_message_id
      ? byId.get(r.reply_to_message_id)
      : undefined
    return {
      messageId: r.message_id,
      mine: r.sender_id === me.legacyUserId,
      senderName: names.get(r.sender_id) ?? null,
      body: r.message,
      isEdited: r.is_edited,
      createdAt: r.created_at,
      replyTo: parent
        ? {
            body: parent.message,
            senderName: names.get(parent.sender_id) ?? null,
          }
        : null,
    }
  })

  return {
    meta: {
      otherUserId,
      otherName: names.get(otherUserId) ?? null,
      propertyId,
      propertyName: propNames.get(propertyId) ?? null,
    },
    messages,
  }
}

export async function sendMessage(input: unknown): Promise<void> {
  const me = await requireUser()
  const data = parseOrThrow(sendMessageSchema, input)
  const propertyId = data.property_id ?? null

  if (
    propertyId === null ||
    !(await canMessage(me, data.receiver_id, propertyId))
  ) {
    throw new ServiceError(
      'You cannot message this person about this property.',
      'forbidden',
    )
  }

  await messagingRepo.insertMessage({
    sender_id: me.legacyUserId,
    receiver_id: data.receiver_id,
    property_id: propertyId,
    message: data.message,
    reply_to_message_id: data.reply_to_message_id ?? null,
  })

  await messagingRepo.notify({
    user_id: data.receiver_id,
    notification_type: 'MESSAGE',
    title: 'New message',
    message: data.message.slice(0, 140),
    reference_type: 'message',
    reference_id: data.receiver_id,
  })
}

export async function editMessage(input: unknown): Promise<void> {
  const me = await requireUser()
  const data = parseOrThrow(editMessageSchema, input)
  const row = await messagingRepo.getMessage(data.message_id)
  if (!row || row.sender_id !== me.legacyUserId) {
    throw new ServiceError('Message not found.', 'not_found')
  }
  await messagingRepo.updateMessageBody(data.message_id, data.message)
}

export type ConversationSummary = {
  otherUserId: number
  otherName: string | null
  propertyId: number | null
  propertyName: string | null
  lastMessage: string
  lastAt: string
  unread: number
}

export async function listMyConversations(): Promise<ConversationSummary[]> {
  const me = await requireUser()
  const rows = await messagingRepo.listMessagesForUser(me.legacyUserId)

  type Group = {
    otherUserId: number
    propertyId: number | null
    last: (typeof rows)[number]
    unread: number
  }
  const groups = new Map<string, Group>()

  for (const r of rows) {
    const otherUserId =
      r.sender_id === me.legacyUserId ? r.receiver_id : r.sender_id
    const key = `${otherUserId}:${r.property_id ?? 'none'}`
    const g = groups.get(key)
    if (!g) {
      groups.set(key, {
        otherUserId,
        propertyId: r.property_id,
        last: r,
        unread: r.receiver_id === me.legacyUserId && !r.is_read ? 1 : 0,
      })
    } else {
      if (r.created_at > g.last.created_at) g.last = r
      if (r.receiver_id === me.legacyUserId && !r.is_read) g.unread += 1
    }
  }

  const list = [...groups.values()]
  const [names, propNames] = await Promise.all([
    bookingsRepo.tenantNamesByIds(list.map((g) => g.otherUserId)),
    bookingsRepo.propertyNamesByIds(
      list.map((g) => g.propertyId).filter((id): id is number => id != null),
    ),
  ])

  return list
    .map((g) => ({
      otherUserId: g.otherUserId,
      otherName: names.get(g.otherUserId) ?? null,
      propertyId: g.propertyId,
      propertyName: g.propertyId ? (propNames.get(g.propertyId) ?? null) : null,
      lastMessage: g.last.message,
      lastAt: g.last.created_at,
      unread: g.unread,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

/** Validate a fresh conversation can be started (from a booking/inquiry link). */
export async function assertCanStartConversation(
  otherUserId: number,
  propertyId: number,
): Promise<ConversationMeta> {
  const me = await requireUser()
  if (!(await canMessage(me, otherUserId, propertyId))) {
    throw new ServiceError('Conversation not available.', 'forbidden')
  }
  const [names, propNames] = await Promise.all([
    bookingsRepo.tenantNamesByIds([otherUserId]),
    bookingsRepo.propertyNamesByIds([propertyId]),
  ])
  return {
    otherUserId,
    otherName: names.get(otherUserId) ?? null,
    propertyId,
    propertyName: propNames.get(propertyId) ?? null,
  }
}
