import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({ requireRole: vi.fn() }))
vi.mock('@/repositories/payouts.repository', () => ({
  getFeeSettings: vi.fn(),
  getPayoutSettings: vi.fn(),
  saveFeeSettings: vi.fn(),
  savePayoutSettings: vi.fn(),
  listEarnings: vi.fn(),
  getActiveMethod: vi.fn(),
  getMethod: vi.fn(),
  replaceMethod: vi.fn(),
  listPayoutsByLandlord: vi.fn(),
  listPayouts: vi.fn(),
  getPayout: vi.fn(),
  callRequestPayout: vi.fn(),
  decidePayout: vi.fn(),
  releaseEarnings: vi.fn(),
  markEarningsPaidOut: vi.fn(),
}))
vi.mock('@/repositories/bookings.repository', () => ({
  getBooking: vi.fn().mockResolvedValue({ booking_id: 1, property_id: 3 }),
  propertyNamesByIds: vi.fn().mockResolvedValue(new Map([[3, 'Sunrise']])),
}))
vi.mock('@/repositories/messaging.repository', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/repositories/users.repository', () => ({
  listAccountsByIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/services/audit.service', () => ({ recordAudit: vi.fn() }))

const { requireRole } = await import('@/lib/auth/dal')
const repo = await import('@/repositories/payouts.repository')
const messaging = await import('@/repositories/messaging.repository')
const audit = await import('@/services/audit.service')
const service = await import('@/services/payouts.service')

const landlord = {
  legacyUserId: 5,
  fullName: 'Lana',
  email: 'l@x.com',
  roles: ['landlord'],
}
const admin = {
  legacyUserId: 1,
  fullName: 'Ada',
  email: 'a@x.com',
  roles: ['superadmin'],
}
const DAY = new Date('2026-09-30T04:00:00Z') // the 30th, noon in Manila
const OTHER_DAY = new Date('2026-09-26T04:00:00Z')

const earning = (over: Record<string, unknown> = {}) => ({
  earning_id: 1,
  landlord_id: 5,
  booking_id: 1,
  payment_id: 1,
  gross_amount: 1000,
  service_fee_amount: 15,
  processing_fee_amount: 15,
  net_amount: 970,
  status: 'pending',
  payout_id: null,
  available_at: '2026-09-20T00:00:00Z',
  created_at: '2026-09-17T00:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireRole).mockResolvedValue(landlord as never)
  vi.mocked(repo.getFeeSettings).mockResolvedValue({
    fee_value: 1.5,
    paymongo_fee_rate: 1.5,
  } as never)
  vi.mocked(repo.getPayoutSettings).mockResolvedValue({
    payout_day_1: 30,
    minimum_threshold: 1000,
    settlement_period_days: 3,
  } as never)
  vi.mocked(repo.listEarnings).mockResolvedValue([
    earning(),
    earning({ earning_id: 2, payment_id: 2, net_amount: 100 }),
  ] as never)
  vi.mocked(repo.getActiveMethod).mockResolvedValue({
    withdrawal_method_id: 9,
    method_type: 'gcash',
    account_name: 'Lana',
    masked_account_number: '•••• 4567',
  } as never)
  vi.mocked(repo.listPayoutsByLandlord).mockResolvedValue([])
})

describe('getMyEarnings', () => {
  it('shows net and the deductions, and splits ready / hold / processing / withdrawn', async () => {
    vi.mocked(repo.listEarnings).mockResolvedValue([
      earning(),
      earning({
        earning_id: 2,
        payment_id: 2,
        net_amount: 100,
        available_at: '2026-10-05T00:00:00Z',
      }), // still in hold
      earning({
        earning_id: 3,
        payment_id: 3,
        net_amount: 200,
        status: 'in_payout',
        payout_id: 7,
      }),
      earning({
        earning_id: 4,
        payment_id: 4,
        net_amount: 300,
        status: 'paid_out',
        payout_id: 6,
      }),
    ] as never)
    const r = await service.getMyEarnings(DAY)
    expect(r.available).toBe(970)
    expect(r.onHold).toBe(100)
    expect(r.processing).toBe(200)
    expect(r.withdrawn).toBe(300)
    expect(r.earnings[0]).toMatchObject({
      net: 970,
      paymongoFee: 15,
      paymongoPct: 1.5,
      platformFee: 15,
      platformPct: 1.5,
      propertyName: 'Sunrise',
    })
  })

  it('can withdraw only on the withdrawal day, above the minimum', async () => {
    vi.mocked(repo.listEarnings).mockResolvedValue([
      earning(),
      earning({ earning_id: 2, payment_id: 2, net_amount: 500 }),
    ] as never)
    expect((await service.getMyEarnings(DAY)).blocker).toBeNull()
    expect((await service.getMyEarnings(OTHER_DAY)).blocker).toMatch(/day 30/)
    vi.mocked(repo.listEarnings).mockResolvedValue([
      earning({ net_amount: 400 }),
    ] as never)
    expect((await service.getMyEarnings(DAY)).blocker).toMatch(/minimum/)
  })

  it('follows the day the admin chose', async () => {
    vi.mocked(repo.getPayoutSettings).mockResolvedValue({
      payout_day_1: 15,
      minimum_threshold: 1000,
      settlement_period_days: 3,
    } as never)
    const r = await service.getMyEarnings(new Date('2026-09-26T04:00:00Z'))
    expect(r.nextWithdrawalDate).toBe('2026-10-15')
    expect(r.rules.withdrawalDay).toBe(15)
  })
})

describe('refunds', () => {
  it('a refunded earning still in the balance is void; one already withdrawn becomes a deduction from the next withdrawal', async () => {
    vi.mocked(repo.listEarnings).mockResolvedValue([
      earning({ net_amount: 2000 }), // ready
      earning({
        earning_id: 2,
        payment_id: 2,
        net_amount: 500,
        status: 'reversed',
        refunded_at: '2026-09-27T00:00:00Z',
      }),
      earning({
        earning_id: 3,
        payment_id: 3,
        net_amount: 300,
        status: 'paid_out',
        payout_id: 6,
        refunded_at: '2026-09-27T00:00:00Z',
        adjustment_amount: -300,
        clawback_settled_at: null,
      }),
      earning({
        earning_id: 4,
        payment_id: 4,
        net_amount: 100,
        status: 'paid_out',
        payout_id: 6,
        refunded_at: '2026-09-01T00:00:00Z',
        adjustment_amount: -100,
        clawback_settled_at: '2026-09-10T00:00:00Z',
      }),
    ] as never)
    const r = await service.getMyEarnings(DAY)
    expect(r.clawback).toBe(300) // the settled one is not deducted twice
    expect(r.available).toBe(1700) // 2000 ready - 300 to take back; the reversed 500 never counts
    expect(r.withdrawn).toBe(0) // refunded money is not "withdrawn earnings"
    expect(r.earnings.filter((e) => e.refunded)).toHaveLength(3)
  })
  it('a refund that wipes out the ready money leaves nothing to withdraw', async () => {
    vi.mocked(repo.listEarnings).mockResolvedValue([
      earning({ net_amount: 200 }),
      earning({
        earning_id: 3,
        payment_id: 3,
        net_amount: 900,
        status: 'paid_out',
        payout_id: 6,
        refunded_at: '2026-09-27T00:00:00Z',
        adjustment_amount: -900,
        clawback_settled_at: null,
      }),
    ] as never)
    const r = await service.getMyEarnings(DAY)
    expect(r.available).toBe(0)
    expect(r.blocker).toMatch(/no earnings/)
  })
})

describe('requestWithdrawal', () => {
  beforeEach(() => {
    vi.mocked(repo.listEarnings).mockResolvedValue([
      earning(),
      earning({ earning_id: 2, payment_id: 2, net_amount: 500 }),
    ] as never)
  })
  it('claims the earnings through the atomic database call', async () => {
    vi.mocked(repo.callRequestPayout).mockResolvedValue(11)
    await expect(service.requestWithdrawal(DAY)).resolves.toEqual({
      payoutId: 11,
    })
    expect(repo.callRequestPayout).toHaveBeenCalledWith(5, 9)
  })
  it('refuses on the wrong day, without touching the database', async () => {
    await expect(service.requestWithdrawal(OTHER_DAY)).rejects.toMatchObject({
      code: 'conflict',
      message: /day 30/,
    })
    expect(repo.callRequestPayout).not.toHaveBeenCalled()
  })
  it('refuses while a previous withdrawal is open', async () => {
    vi.mocked(repo.listPayoutsByLandlord).mockResolvedValue([
      {
        payout_id: 1,
        status: 'pending',
        amount: 100,
        requested_at: '2026-09-01',
        reference: 'x',
      },
    ] as never)
    await expect(service.requestWithdrawal(DAY)).rejects.toMatchObject({
      message: /still being processed/,
    })
  })
  it('turns a race lost inside the database into a plain message', async () => {
    vi.mocked(repo.callRequestPayout).mockRejectedValue(
      new Error('payout_open'),
    )
    await expect(service.requestWithdrawal(DAY)).rejects.toMatchObject({
      code: 'conflict',
      message: /still being processed/,
    })
  })
})

describe('admin settings', () => {
  beforeEach(() => vi.mocked(requireRole).mockResolvedValue(admin as never))
  it('saves fees, day, minimum and hold, and writes the audit log', async () => {
    await service.updatePayoutSettings({
      paymongo_fee_rate: '1.5',
      platform_fee_rate: '2',
      withdrawal_day: '25',
      minimum_threshold: '500',
      hold_days: '5',
    })
    expect(repo.saveFeeSettings).toHaveBeenCalledWith(expect.anything(), {
      fee_value: 2,
      paymongo_fee_rate: 1.5,
      updated_by: 1,
    })
    expect(repo.savePayoutSettings).toHaveBeenCalledWith(expect.anything(), {
      payout_day_1: 25,
      minimum_threshold: 500,
      settlement_period_days: 5,
      updated_by: 1,
    })
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payout.settings_changed' }),
    )
  })
  it('rejects a bad day', async () => {
    await expect(
      service.updatePayoutSettings({
        paymongo_fee_rate: '1.5',
        platform_fee_rate: '1.5',
        withdrawal_day: '40',
        minimum_threshold: '1',
        hold_days: '3',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(repo.saveFeeSettings).not.toHaveBeenCalled()
  })
})

describe('admin payouts', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(admin as never)
    vi.mocked(repo.getPayout).mockResolvedValue({
      payout_id: 7,
      landlord_id: 5,
      amount: 970,
      reference: 'WD-1',
    } as never)
    vi.mocked(repo.decidePayout).mockResolvedValue(true)
  })
  it('marking paid records the reference, closes the earnings and tells the landlord', async () => {
    await service.completePayout(7, { reference: 'InstaPay 908098' })
    expect(repo.decidePayout).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: 'completed',
        provider_payout_id: 'InstaPay 908098',
      }),
    )
    expect(repo.markEarningsPaidOut).toHaveBeenCalledWith(7)
    expect(messaging.notify).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 5, title: 'Withdrawal sent' }),
    )
  })
  it('rejecting returns the money to the landlord and needs a reason', async () => {
    await expect(service.failPayout(7, { reason: '' })).rejects.toMatchObject({
      code: 'validation',
    })
    await service.failPayout(7, { reason: 'Account number not found' })
    expect(repo.releaseEarnings).toHaveBeenCalledWith(7)
    expect(messaging.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('back in your balance'),
      }),
    )
  })
  it('the second admin to click loses cleanly and changes nothing', async () => {
    vi.mocked(repo.decidePayout).mockResolvedValue(false)
    await expect(
      service.completePayout(7, { reference: 'abc' }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(repo.markEarningsPaidOut).not.toHaveBeenCalled()
  })
})

describe('saveWithdrawalMethod', () => {
  it('stores the full number for the admin and a masked one for display', async () => {
    await service.saveWithdrawalMethod({
      method_type: 'bank',
      bank_name: 'BDO',
      account_name: 'Lana',
      account_number: '1234 5678 90',
    })
    expect(repo.replaceMethod).toHaveBeenCalledWith(5, {
      method_type: 'bank',
      account_name: 'Lana',
      masked_account_number: 'BDO •••• 7890',
      provider_reference: '1234567890',
    })
  })
  it('a bank needs its name', async () => {
    await expect(
      service.saveWithdrawalMethod({
        method_type: 'bank',
        account_name: 'Lana',
        account_number: '1234567890',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })
})
