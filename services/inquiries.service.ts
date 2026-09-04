import 'server-only'

import { requireUser, type CurrentUser } from '@/lib/auth/dal'
import { primaryRole } from '@/lib/auth/roles'
import { isSuperadmin } from '@/lib/permissions/properties'
import * as bookingsRepo from '@/repositories/bookings.repository'
import * as caretakersRepo from '@/repositories/caretakers.repository'
import * as discoveryRepo from '@/repositories/discovery.repository'
import * as messagingRepo from '@/repositories/messaging.repository'
import * as propertiesRepo from '@/repositories/properties.repository'
import { ServiceError, parseOrThrow } from '@/services/errors'
import { requireOperableProperty } from '@/services/property-access'
import { createInquirySchema, respondInquirySchema } from '@/schemas/messaging'

export type InquiryListItem = {
  inquiryId: number
  propertyId: number
  propertyName: string | null
  subject: string
  status: string
  createdAt: string
  respondedAt: string | null
  tenantName?: string | null
}

async function decorate(
  rows: messagingRepo.InquiryRow[],
  options: { withTenant?: boolean } = {},
): Promise<InquiryListItem[]> {
  if (rows.length === 0) return []
  const [propNames, tenantNames] = await Promise.all([
    bookingsRepo.propertyNamesByIds(rows.map((r) => r.property_id)),
    options.withTenant
      ? bookingsRepo.tenantNamesByIds(rows.map((r) => r.tenant_id))
      : Promise.resolve(new Map<number, string | null>()),
  ])
  return rows.map((r) => ({
    inquiryId: r.inquiry_id,
    propertyId: r.property_id,
    propertyName: propNames.get(r.property_id) ?? null,
    subject: r.subject,
    status: r.status,
    createdAt: r.created_at,
    respondedAt: r.responded_at,
    tenantName: options.withTenant
      ? (tenantNames.get(r.tenant_id) ?? null)
      : undefined,
  }))
}

export type InquiryDetail = InquiryListItem & {
  message: string
  response: string | null
  responderRole: string | null
  canRespond: boolean
  tenantId: number
  landlordId: number
}

/* ---- tenant ---- */

export async function createInquiry(
  propertyId: number,
  input: unknown,
): Promise<number> {
  const user = await requireUser()
  if (!user.roles.includes('tenant') && !isSuperadmin(user)) {
    throw new ServiceError(
      'Only a tenant account can send an inquiry.',
      'forbidden',
    )
  }
  const property = await discoveryRepo.getVisibleProperty(propertyId)
  if (!property || property.property_owner == null) {
    throw new ServiceError('Property not found.', 'not_found')
  }
  const data = parseOrThrow(createInquirySchema, input)

  const inquiry = await messagingRepo.insertInquiry({
    property_id: propertyId,
    tenant_id: user.legacyUserId,
    landlord_id: property.property_owner,
    subject: data.subject,
    message: data.message,
  })

  await messagingRepo.notify({
    user_id: property.property_owner,
    notification_type: 'INQUIRY',
    title: 'New property inquiry',
    message: `A tenant asked: ${data.subject}`,
    reference_type: 'inquiry',
    reference_id: inquiry.inquiry_id,
  })

  return inquiry.inquiry_id
}

export async function listMyInquiries(): Promise<InquiryListItem[]> {
  const user = await requireUser()
  return decorate(await messagingRepo.listInquiriesForTenant(user.legacyUserId))
}

export async function getMyInquiry(id: number): Promise<InquiryDetail> {
  const user = await requireUser()
  const row = await messagingRepo.getInquiry(id)
  if (!row || (row.tenant_id !== user.legacyUserId && !isSuperadmin(user))) {
    throw new ServiceError('Inquiry not found.', 'not_found')
  }
  if (!row.tenant_read_at) {
    await messagingRepo.updateInquiry(id, {
      tenant_read_at: new Date().toISOString(),
    })
  }
  const [base] = await decorate([row])
  return {
    ...base,
    message: row.message,
    response: row.response,
    responderRole: row.responder_role,
    canRespond: false,
    tenantId: row.tenant_id,
    landlordId: row.landlord_id,
  }
}

/* ---- manager ---- */

async function managerPropertyIds(
  user: CurrentUser,
  area: 'landlord' | 'caretaker',
): Promise<number[]> {
  if (isSuperadmin(user)) {
    return (await propertiesRepo.listProperties({})).map((p) => p.property_id)
  }
  if (area === 'caretaker') {
    return caretakersRepo.listAssignedPropertyIds(user.legacyUserId, {
      activeOnly: true,
    })
  }
  return (
    await propertiesRepo.listProperties({ ownerId: user.legacyUserId })
  ).map((p) => p.property_id)
}

export async function listManagedInquiries(
  area: 'landlord' | 'caretaker',
): Promise<InquiryListItem[]> {
  const user = await requireUser()
  const ids = await managerPropertyIds(user, area)
  return decorate(await messagingRepo.listInquiriesForProperties(ids), {
    withTenant: true,
  })
}

export async function getManagedInquiry(id: number): Promise<InquiryDetail> {
  const user = await requireUser()
  const row = await messagingRepo.getInquiry(id)
  if (!row) throw new ServiceError('Inquiry not found.', 'not_found')
  await requireOperableProperty(row.property_id)

  const roleField =
    primaryRole(user.roles) === 'caretaker'
      ? 'caretaker_read_at'
      : 'landlord_read_at'
  if (!row[roleField]) {
    await messagingRepo.updateInquiry(id, {
      [roleField]: new Date().toISOString(),
      status: row.status === 'new' ? 'read' : row.status,
    })
  }

  const [base] = await decorate([row], { withTenant: true })
  return {
    ...base,
    message: row.message,
    response: row.response,
    responderRole: row.responder_role,
    canRespond: row.status !== 'closed',
    tenantId: row.tenant_id,
    landlordId: row.landlord_id,
  }
}

export async function respondToInquiry(
  id: number,
  input: unknown,
): Promise<void> {
  const user = await requireUser()
  const row = await messagingRepo.getInquiry(id)
  if (!row) throw new ServiceError('Inquiry not found.', 'not_found')
  await requireOperableProperty(row.property_id)

  const data = parseOrThrow(respondInquirySchema, input)
  await messagingRepo.updateInquiry(id, {
    response: data.response,
    responder_id: user.legacyUserId,
    responder_role: primaryRole(user.roles),
    responded_at: new Date().toISOString(),
    status: data.close ? 'closed' : 'read',
  })

  await messagingRepo.notify({
    user_id: row.tenant_id,
    notification_type: 'INQUIRY',
    title: 'Inquiry answered',
    message: `Your inquiry "${row.subject}" got a response.`,
    reference_type: 'inquiry',
    reference_id: id,
  })
}
