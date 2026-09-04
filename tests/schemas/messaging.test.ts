import { describe, expect, it } from 'vitest'

import {
  createInquirySchema,
  editMessageSchema,
  respondInquirySchema,
  sendMessageSchema,
} from '@/schemas/messaging'

describe('sendMessageSchema', () => {
  it('accepts a valid message', () => {
    expect(
      sendMessageSchema.safeParse({
        receiver_id: '5',
        property_id: '2',
        message: 'hi',
      }).success,
    ).toBe(true)
  })
  it('rejects an empty message', () => {
    expect(
      sendMessageSchema.safeParse({ receiver_id: '5', message: '   ' }).success,
    ).toBe(false)
  })
  it('treats a blank property_id as undefined', () => {
    const r = sendMessageSchema.safeParse({
      receiver_id: '5',
      property_id: '',
      message: 'hi',
    })
    expect(r.success && r.data.property_id).toBeUndefined()
  })
})

describe('editMessageSchema', () => {
  it('requires an id and non-empty body', () => {
    expect(
      editMessageSchema.safeParse({ message_id: '3', message: 'x' }).success,
    ).toBe(true)
    expect(
      editMessageSchema.safeParse({ message_id: '3', message: '' }).success,
    ).toBe(false)
  })
})

describe('createInquirySchema', () => {
  it('needs a subject and a substantive message', () => {
    expect(
      createInquirySchema.safeParse({
        subject: 'Available?',
        message: 'Is the studio available in April?',
      }).success,
    ).toBe(true)
    expect(
      createInquirySchema.safeParse({ subject: 'x', message: 'short' }).success,
    ).toBe(false)
  })
})

describe('respondInquirySchema', () => {
  it('coerces the close checkbox', () => {
    const on = respondInquirySchema.safeParse({ response: 'yes', close: 'on' })
    const off = respondInquirySchema.safeParse({ response: 'yes' })
    expect(on.success && on.data.close).toBe(true)
    expect(off.success && off.data.close).toBe(false)
  })
})
