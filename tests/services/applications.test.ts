import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/dal', () => ({ requireRole: vi.fn() }))
vi.mock('@/repositories/applications.repository', () => ({
  insertApplication: vi.fn(),
  hasPendingFor: vi.fn(),
  listByStatus: vi.fn(),
  getApplication: vi.fn(),
  countPending: vi.fn(),
  decide: vi.fn(),
  insertDocuments: vi.fn(),
  listDocumentsFor: vi.fn(),
  deleteApplication: vi.fn(),
  createSignedUpload: vi.fn(),
  objectExists: vi.fn(),
  signedViewUrl: vi.fn(),
}))
vi.mock('@/repositories/users.repository', () => ({
  getAccountByEmail: vi.fn(),
  getAccountById: vi.fn(),
}))
const { updateUserById } = vi.hoisted(() => ({ updateUserById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById } } }),
}))
vi.mock('@/services/admin.service', () => ({ createLandlord: vi.fn() }))
vi.mock('@/services/audit.service', () => ({ recordAudit: vi.fn() }))

const dal = await import('@/lib/auth/dal')
const repo = await import('@/repositories/applications.repository')
const usersRepo = await import('@/repositories/users.repository')
const adminService = await import('@/services/admin.service')
const audit = await import('@/services/audit.service')
const service = await import('@/services/applications.service')
const { landlordApplicationSchema } = await import('@/schemas/application')

const BATCH = '123e4567-e89b-12d3-a456-426614174000'
const UUID2 = '223e4567-e89b-12d3-a456-426614174000'
const doc = (type: string, ext = 'pdf') => ({
  type,
  path: `applications/${BATCH}/${type}-${UUID2}.${ext}`,
  name: `${type}.${ext}`,
  mime: 'application/pdf',
  size: 1000,
})
const ALL_REQUIRED = [
  'mayors_permit',
  'barangay_permit',
  'dti_registration',
  'proof_ownership',
  'valid_id',
].map((t) => doc(t))

const valid = {
  full_name: 'Lana Cruz',
  email: 'Lana@Example.com',
  phone: '0917 123 4567',
  business_name: '',
  property_name: 'Sunrise Boarding House',
  address: '12 Rizal St, Tagbilaran',
  rooms_count: '8',
  description: '',
  batch_id: BATCH,
  documents: JSON.stringify(ALL_REQUIRED),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(usersRepo.getAccountByEmail).mockResolvedValue(null)
  vi.mocked(repo.hasPendingFor).mockResolvedValue(false)
  vi.mocked(repo.insertApplication).mockResolvedValue({
    application_id: 7,
  } as never)
  vi.mocked(repo.objectExists).mockResolvedValue(true)
  vi.mocked(repo.insertDocuments).mockReset()
  vi.mocked(repo.listDocumentsFor).mockResolvedValue([])
  vi.mocked(repo.createSignedUpload).mockImplementation((async (
    path: string,
  ) => ({ path, token: 't' })) as never)
  vi.mocked(dal.requireRole).mockResolvedValue({
    legacyUserId: 1,
    roles: ['superadmin'],
  } as never)
})

describe('application form rules', () => {
  it('accepts a complete application and tidies it up', () => {
    const d = landlordApplicationSchema.parse(valid)
    expect(d.email).toBe('lana@example.com')
    expect(d.phone).toBe('+63 917 123 4567')
    expect(d.rooms_count).toBe(8)
    expect(d.business_name).toBeUndefined()
  })
  it.each([
    [{ full_name: 'L' }, 'full_name'],
    [{ email: 'nope' }, 'email'],
    [{ phone: '12345' }, 'phone'],
    [{ property_name: '' }, 'property_name'],
    [{ address: 'x' }, 'address'],
    [{ rooms_count: '0' }, 'rooms_count'],
    [{ rooms_count: '2.5' }, 'rooms_count'],
    [{ rooms_count: '5000' }, 'rooms_count'],
  ])('rejects %j', (over, field) => {
    const r = landlordApplicationSchema.safeParse({ ...valid, ...over })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.issues.map((i) => i.path[0])).toContain(field)
  })
})

describe('submitApplication (public)', () => {
  it('saves it and hands back a reference', async () => {
    await expect(service.submitApplication(valid)).resolves.toEqual({
      reference: 'APP-00007',
    })
    expect(repo.insertApplication).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'lana@example.com', rooms_count: 8 }),
    )
  })
  it('drops a bot that filled the hidden field, storing nothing', async () => {
    await service.submitApplication({
      ...valid,
      website: 'http://spam.example',
    })
    expect(repo.insertApplication).not.toHaveBeenCalled()
  })
  it('refuses an email that already has an account, or an open application', async () => {
    vi.mocked(usersRepo.getAccountByEmail).mockResolvedValue({
      legacy_user_id: 5,
    } as never)
    await expect(service.submitApplication(valid)).rejects.toMatchObject({
      code: 'conflict',
      fieldErrors: { email: expect.any(Array) },
    })
    vi.mocked(usersRepo.getAccountByEmail).mockResolvedValue(null)
    vi.mocked(repo.hasPendingFor).mockResolvedValue(true)
    await expect(service.submitApplication(valid)).rejects.toMatchObject({
      code: 'conflict',
      message: /waiting for review/,
    })
    expect(repo.insertApplication).not.toHaveBeenCalled()
  })
  it('says what to do when the table is not set up yet', async () => {
    vi.mocked(repo.insertApplication).mockRejectedValue(
      Object.assign(new Error('x'), {
        cause: {
          code: 'PGRST205',
          message: "Could not find the table 'public.landlord_applications'",
        },
      }),
    )
    await expect(service.submitApplication(valid)).rejects.toMatchObject({
      message: /migration 0020/,
    })
  })
})

describe('documents on an application', () => {
  it('are saved with the application', async () => {
    await service.submitApplication(valid)
    const rows = vi.mocked(repo.insertDocuments).mock.calls[0][0]
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({
      application_id: 7,
      doc_type: 'mayors_permit',
      mime_type: 'application/pdf',
    })
  })
  it('need at least one file — whatever the applicant calls them, staff read them all', async () => {
    await expect(
      service.submitApplication({ ...valid, documents: '[]' }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: /attach your documents/,
    })
    expect(repo.insertApplication).not.toHaveBeenCalled()
    await expect(
      service.submitApplication({
        ...valid,
        documents: JSON.stringify([doc('other'), doc('other')]),
      }),
    ).resolves.toBeDefined()
  })
  it('must be files the server issued for THIS batch (no pointing at someone else’s file)', async () => {
    const stolen = {
      ...doc('valid_id'),
      path: `applications/${UUID2}/valid_id-${UUID2}.pdf`,
    }
    const docs = [...ALL_REQUIRED.filter((d) => d.type !== 'valid_id'), stolen]
    await expect(
      service.submitApplication({ ...valid, documents: JSON.stringify(docs) }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      service.submitApplication({ ...valid, batch_id: 'not-a-uuid' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })
  it('must really be in storage', async () => {
    vi.mocked(repo.objectExists).mockResolvedValueOnce(false)
    await expect(service.submitApplication(valid)).rejects.toMatchObject({
      code: 'conflict',
      message: /did not finish uploading/,
    })
    expect(repo.insertApplication).not.toHaveBeenCalled()
  })
  it('never leave an application behind without its documents', async () => {
    vi.mocked(repo.insertDocuments).mockRejectedValue(new Error('db'))
    await expect(service.submitApplication(valid)).rejects.toThrow('db')
    expect(repo.deleteApplication).toHaveBeenCalledWith(7)
  })
  it('takes any mix of files up to the limit of 12', async () => {
    const eleven = Array.from({ length: 11 }, () => doc('other'))
    await expect(
      service.submitApplication({
        ...valid,
        documents: JSON.stringify(eleven),
      }),
    ).resolves.toBeDefined()
    const thirteen = Array.from({ length: 13 }, () => doc('other'))
    await expect(
      service.submitApplication({
        ...valid,
        documents: JSON.stringify(thirteen),
      }),
    ).rejects.toMatchObject({ code: 'validation', message: /at most 12/ })
  })
})

describe('prepareApplicationUploads (public)', () => {
  const ask = (docs: unknown[], extra: object = {}) =>
    service.prepareApplicationUploads({ docs, ...extra })
  const file = (type: string, over: object = {}) => ({
    type,
    name: 'a.pdf',
    mime: 'application/pdf',
    size: 1000,
    ...over,
  })
  it('issues an upload link per file, with server-chosen names in one private batch', async () => {
    const r = await ask([
      file('mayors_permit'),
      file('valid_id', { mime: 'image/png' }),
    ])
    expect(r.uploads).toHaveLength(2)
    expect(r.batchId).toMatch(/^[0-9a-f-]{36}$/)
    for (const u of r.uploads)
      expect(u.path.startsWith(`applications/${r.batchId}/`)).toBe(true)
    expect(r.uploads[1].path.endsWith('.png')).toBe(true)
  })
  it('refuses executables, huge files, empty lists and bots', async () => {
    await expect(
      ask([
        file('valid_id', { mime: 'application/x-msdownload', name: 'a.exe' }),
      ]),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      ask([file('valid_id', { size: 6 * 1024 * 1024 })]),
    ).rejects.toMatchObject({ code: 'validation', message: /5 MB/ })
    await expect(ask([])).rejects.toMatchObject({ code: 'validation' })
    await expect(
      ask([file('valid_id')], { website: 'spam' }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(ask([file('nonsense')])).rejects.toMatchObject({
      code: 'validation',
    })
    expect(repo.createSignedUpload).not.toHaveBeenCalled()
  })
})

describe('resetApplicantPassword', () => {
  const approved = {
    application_id: 7,
    status: 'approved',
    full_name: 'Lana Cruz',
    email: 'lana@example.com',
    landlord_id: 1000030,
  }
  beforeEach(() => {
    updateUserById.mockReset().mockResolvedValue({ error: null })
    vi.mocked(repo.getApplication).mockResolvedValue(approved as never)
    vi.mocked(usersRepo.getAccountById).mockResolvedValue({
      auth_user_id: 'auth-9',
    } as never)
  })
  it('sets a brand-new password on the account created from the application, and audits it (without the password)', async () => {
    const r = await service.resetApplicantPassword(7)
    expect(r.email).toBe('lana@example.com')
    expect(updateUserById).toHaveBeenCalledWith('auth-9', {
      password: r.password,
    })
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'application.password_reset' }),
    )
    expect(
      JSON.stringify(vi.mocked(audit.recordAudit).mock.calls),
    ).not.toContain(r.password)
  })
  it('only for an approved application that has an account', async () => {
    vi.mocked(repo.getApplication).mockResolvedValue({
      ...approved,
      status: 'pending',
      landlord_id: null,
    } as never)
    await expect(service.resetApplicantPassword(7)).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(updateUserById).not.toHaveBeenCalled()
  })
  it('tells the admin when Supabase refuses', async () => {
    updateUserById.mockResolvedValue({ error: { message: 'nope' } })
    await expect(service.resetApplicantPassword(7)).rejects.toThrow(
      /new password/,
    )
  })
  it('is superadmin-only', async () => {
    vi.mocked(dal.requireRole).mockRejectedValue(new Error('redirect'))
    await expect(service.resetApplicantPassword(7)).rejects.toThrow('redirect')
  })
})

describe('getApplicationDocuments (admin)', () => {
  it('gives short-lived links and records that the admin looked', async () => {
    vi.mocked(repo.getApplication).mockResolvedValue({
      application_id: 7,
      full_name: 'Lana Cruz',
    } as never)
    vi.mocked(repo.listDocumentsFor).mockResolvedValue([
      {
        doc_type: 'valid_id',
        storage_path: 'p',
        file_name: 'id.png',
        mime_type: 'image/png',
      },
    ] as never)
    vi.mocked(repo.signedViewUrl).mockResolvedValue('https://signed.example/x')
    const links = await service.getApplicationDocuments(7)
    expect(links).toEqual([
      {
        type: 'valid_id',
        label: 'Valid government ID',
        fileName: 'id.png',
        mime: 'image/png',
        url: 'https://signed.example/x',
      },
    ])
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'application.documents_viewed' }),
    )
  })
})

describe('review', () => {
  const pending = {
    application_id: 7,
    status: 'pending',
    full_name: 'Lana Cruz',
    email: 'lana@example.com',
    business_name: 'Sunrise Co',
  }
  beforeEach(() => {
    vi.mocked(repo.getApplication).mockResolvedValue(pending as never)
    vi.mocked(repo.decide).mockResolvedValue(true)
    vi.mocked(adminService.createLandlord).mockResolvedValue({
      legacyUserId: 1000030,
    })
  })

  it('approving creates the landlord account and returns a one-time password', async () => {
    const r = await service.approveApplication(7)
    expect(r.email).toBe('lana@example.com')
    expect(r.password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/)
    expect(adminService.createLandlord).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'lana@example.com',
        password: r.password,
        full_name: 'Lana Cruz',
        business_name: 'Sunrise Co',
      }),
    )
    expect(repo.decide).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: 'approved', landlord_id: 1000030 }),
    )
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'application.approved' }),
    )
    expect(
      JSON.stringify(vi.mocked(audit.recordAudit).mock.calls),
    ).not.toContain(r.password) // never logged
  })
  it('will not approve one that was already decided (no second account)', async () => {
    vi.mocked(repo.getApplication).mockResolvedValue({
      ...pending,
      status: 'rejected',
    } as never)
    await expect(service.approveApplication(7)).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(adminService.createLandlord).not.toHaveBeenCalled()
  })
  it('shows the admin why an approval failed (e.g. the email was taken meanwhile)', async () => {
    vi.mocked(adminService.createLandlord).mockRejectedValue(
      Object.assign(new Error('An account with that email already exists.'), {
        code: 'conflict',
      }),
    )
    await expect(service.approveApplication(7)).rejects.toThrow(
      /already exists/,
    )
    expect(repo.decide).not.toHaveBeenCalled()
  })
  it('rejecting needs a reason, and is recorded', async () => {
    await expect(
      service.rejectApplication(7, { reason: '' }),
    ).rejects.toMatchObject({ code: 'validation' })
    await service.rejectApplication(7, {
      reason: 'Could not verify the address',
    })
    expect(repo.decide).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: 'rejected',
        reject_reason: 'Could not verify the address',
      }),
    )
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'application.rejected' }),
    )
  })
  it('is superadmin-only', async () => {
    vi.mocked(dal.requireRole).mockRejectedValue(new Error('redirect'))
    await expect(service.approveApplication(7)).rejects.toThrow('redirect')
    await expect(service.listApplications('pending')).rejects.toThrow(
      'redirect',
    )
  })
  it('generates different passwords every time', () => {
    expect(service.temporaryPassword()).not.toBe(service.temporaryPassword())
  })
})
