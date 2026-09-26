import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}))
vi.mock('@/repositories/payments.repository', () => ({
  callRefundPayment: vi.fn(),
}))
vi.mock('@/repositories/bookings.repository', () => ({}))
vi.mock('@/repositories/caretakers.repository', () => ({}))
vi.mock('@/repositories/properties.repository', () => ({}))
vi.mock('@/repositories/reference.repository', () => ({
  RepositoryError: class extends Error {},
}))
vi.mock('@/services/audit.service', () => ({ recordAudit: vi.fn() }))

const dal = await import('@/lib/auth/dal')
const repo = await import('@/repositories/payments.repository')
const audit = await import('@/services/audit.service')
const { refundPayment } = await import('@/services/payments.service')
const { mapPaymongoEvent } = await import('@/lib/paymongo/status')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(dal.requireRole).mockResolvedValue({
    legacyUserId: 1,
    roles: ['superadmin'],
  } as never)
})

describe('refundPayment', () => {
  it('records the refund through the database and audits it', async () => {
    vi.mocked(repo.callRefundPayment).mockResolvedValue('refunded')
    await refundPayment(20, { note: '  tenant cancelled  ' })
    expect(repo.callRefundPayment).toHaveBeenCalledWith({
      p_payment: 20,
      p_actor: 1,
      p_note: 'tenant cancelled',
    })
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment.refunded', targetId: 20 }),
    )
  })
  it.each([
    ['not_paid', /Only a paid payment/],
    ['already_refunded', /already refunded/],
    ['not_found', /not found/],
  ])('explains %s', async (verdict, message) => {
    vi.mocked(repo.callRefundPayment).mockResolvedValue(verdict)
    await expect(refundPayment(20, {})).rejects.toMatchObject({ message })
    expect(audit.recordAudit).not.toHaveBeenCalled()
  })
  it('is superadmin-only', async () => {
    vi.mocked(dal.requireRole).mockRejectedValue(new Error('redirect'))
    await expect(refundPayment(20, {})).rejects.toThrow('redirect')
    expect(repo.callRefundPayment).not.toHaveBeenCalled()
  })
})

describe('PayMongo refund events', () => {
  it('a refunded payment is recognised, other events are not', () => {
    expect(mapPaymongoEvent('payment.refunded')).toBe('refunded')
    expect(mapPaymongoEvent('payment.paid')).toBe('paid')
    expect(mapPaymongoEvent('payment.refund.updated')).toBe('ignore')
  })
})
