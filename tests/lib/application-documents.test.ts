import { describe, expect, it } from 'vitest'

import {
  DOC_TYPES,
  guessDocType,
  REQUIRED_DOC_TYPES,
  isBatchId,
  isDocPathFor,
  missingRequired,
  newDocPath,
  validateDocFile,
} from '@/lib/applications/documents'

const BATCH = '123e4567-e89b-12d3-a456-426614174000'

describe('document types', () => {
  it('requires the permits, proof of ownership and an ID; the rest are optional', () => {
    expect(REQUIRED_DOC_TYPES).toEqual([
      'mayors_permit',
      'barangay_permit',
      'dti_registration',
      'proof_ownership',
      'valid_id',
    ])
    expect(DOC_TYPES.filter((d) => !d.required).map((d) => d.code)).toEqual([
      'bir_registration',
      'fire_safety',
      'sanitary_permit',
      'other',
    ])
  })
  it('lists what is missing by name', () => {
    expect(
      missingRequired([{ type: 'mayors_permit' }, { type: 'other' }]),
    ).toEqual([
      'Barangay permit / clearance',
      'DTI registration (or SEC / CDA)',
      'Proof of ownership or authority',
      'Valid government ID',
    ])
    expect(
      missingRequired(REQUIRED_DOC_TYPES.map((type) => ({ type }))),
    ).toEqual([])
  })
})

describe('validateDocFile', () => {
  it('takes PDF and images up to 5 MB only', () => {
    expect(validateDocFile({ type: 'application/pdf', size: 1000 })).toBeNull()
    expect(
      validateDocFile({ type: 'image/webp', size: 5 * 1024 * 1024 }),
    ).toBeNull()
    expect(
      validateDocFile({
        type: 'image/png',
        size: 5 * 1024 * 1024 + 1,
        name: 'big.png',
      }),
    ).toMatch(/5 MB/)
    expect(
      validateDocFile({ type: 'application/zip', size: 10, name: 'a.zip' }),
    ).toMatch(/PDF, JPG, PNG or WebP/)
    expect(validateDocFile({ type: 'image/png', size: 0 })).toMatch(/empty/)
  })
})

describe('paths', () => {
  it('are picked by the server and tied to one batch and one document type', () => {
    const path = newDocPath(BATCH, 'valid_id', 'image/jpeg')!
    expect(path.startsWith(`applications/${BATCH}/valid_id-`)).toBe(true)
    expect(isDocPathFor(path, BATCH, 'valid_id')).toBe(true)
    expect(isDocPathFor(path, BATCH, 'mayors_permit')).toBe(false) // a different document type
    expect(
      isDocPathFor(path, '223e4567-e89b-12d3-a456-426614174000', 'valid_id'),
    ).toBe(false) // another batch
    expect(
      isDocPathFor(`applications/${BATCH}/../secret.pdf`, BATCH, 'valid_id'),
    ).toBe(false)
    expect(newDocPath(BATCH, 'valid_id', 'application/zip')).toBeNull()
  })
  it('a batch id must be a uuid', () => {
    expect(isBatchId(BATCH)).toBe(true)
    expect(isBatchId('../x')).toBe(false)
    expect(isBatchId(undefined)).toBe(false)
  })
})

describe('guessDocType', () => {
  it.each([
    ['Mayors permit 2026.pdf', 'mayors_permit'],
    ['business_permit.jpg', 'mayors_permit'],
    ['Barangay-Clearance.png', 'barangay_permit'],
    ['brgy permit.pdf', 'barangay_permit'],
    ['DTI certificate.pdf', 'dti_registration'],
    ['BIR 2303.pdf', 'bir_registration'],
    ['FSIC.pdf', 'fire_safety'],
    ['sanitary permit.jpg', 'sanitary_permit'],
    ['Land Title TCT 12345.pdf', 'proof_ownership'],
    ['lease contract.pdf', 'proof_ownership'],
    ['UMID front.jpg', 'valid_id'],
    ['IMG_2041.jpg', null],
  ])('%s -> %s', (name, expected) => {
    expect(guessDocType(name)).toBe(expected)
  })
})
