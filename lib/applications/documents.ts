/**
 * The documents a property owner attaches to a landlord application. Pure (no I/O): the public form
 * (to fail fast), the server (the authority) and the tests all use it.
 */

export const APPLICATION_BUCKET = 'application-documents'
export const MAX_DOC_BYTES = 5 * 1024 * 1024
/** Most files of one kind (e.g. both sides of an ID, or several pages of a permit). */
export const MAX_PER_TYPE = 3
export const MAX_OTHER_DOCS = MAX_PER_TYPE
export const MAX_DOCS_TOTAL = 12

export const DOC_TYPES = [
  {
    code: 'mayors_permit',
    label: 'Mayor’s / Business permit',
    help: 'The current business permit from the city or municipality.',
    required: true,
  },
  {
    code: 'barangay_permit',
    label: 'Barangay permit / clearance',
    help: 'Barangay business clearance or permit.',
    required: true,
  },
  {
    code: 'dti_registration',
    label: 'DTI registration (or SEC / CDA)',
    help: 'DTI Business Name certificate; corporations and cooperatives attach SEC or CDA.',
    required: true,
  },
  {
    code: 'proof_ownership',
    label: 'Proof of ownership or authority',
    help: 'Land title, tax declaration, or a lease / authorisation from the owner.',
    required: true,
  },
  {
    code: 'valid_id',
    label: 'Valid government ID',
    help: 'Front of a government-issued ID of the owner or representative.',
    required: true,
  },
  {
    code: 'bir_registration',
    label: 'BIR Certificate of Registration (2303)',
    help: 'If you have one.',
    required: false,
  },
  {
    code: 'fire_safety',
    label: 'Fire Safety Inspection Certificate',
    help: 'If you have one.',
    required: false,
  },
  {
    code: 'sanitary_permit',
    label: 'Sanitary permit',
    help: 'If you have one.',
    required: false,
  },
  {
    code: 'other',
    label: 'Other supporting documents',
    help: 'Anything else that helps.',
    required: false,
  },
] as const

export type DocTypeCode = (typeof DOC_TYPES)[number]['code']
export const DOC_TYPE_CODES = DOC_TYPES.map((d) => d.code) as [
  DocTypeCode,
  ...DocTypeCode[],
]
export const REQUIRED_DOC_TYPES = DOC_TYPES.filter((d) => d.required).map(
  (d) => d.code,
)

export const docTypeLabel = (code: string): string =>
  DOC_TYPES.find((d) => d.code === code)?.label ?? code

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
export const ALLOWED_DOC_MIME = Object.keys(EXTENSION)
export const extensionFor = (mime: string): string | null =>
  EXTENSION[mime] ?? null

/** Reason a file cannot be used, or null. */
export function validateDocFile(file: {
  name?: string
  type: string
  size: number
}): string | null {
  const label = file.name ? `“${file.name}”` : 'This file'
  if (!extensionFor(file.type))
    return `${label} must be a PDF, JPG, PNG or WebP.`
  if (file.size <= 0) return `${label} is empty.`
  if (file.size > MAX_DOC_BYTES)
    return `${label} is bigger than ${MAX_DOC_BYTES / 1024 / 1024} MB.`
  return null
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** A name the SERVER picks, so an applicant cannot choose (or overwrite) where a file lands. */
export function newDocPath(
  batchId: string,
  type: DocTypeCode,
  mime: string,
): string | null {
  const ext = extensionFor(mime)
  return ext
    ? `applications/${batchId}/${type}-${crypto.randomUUID()}.${ext}`
    : null
}

export const isBatchId = (value: unknown): value is string =>
  typeof value === 'string' && new RegExp(`^${UUID}$`).test(value)

/** Is `path` a file the server issued for THIS upload batch and this document type? */
export function isDocPathFor(
  path: string,
  batchId: string,
  type: string,
): boolean {
  if (!isBatchId(batchId)) return false
  return new RegExp(
    `^applications/${batchId}/${type}-${UUID}\\.(?:jpg|png|webp|pdf)$`,
  ).test(path)
}

export type AttachedDoc = { type: string }

/** Which required document types have no file yet (labels, for a message). */
export function missingRequired(docs: AttachedDoc[]): string[] {
  const have = new Set(docs.map((d) => d.type))
  return DOC_TYPES.filter((d) => d.required && !have.has(d.code)).map(
    (d) => d.label,
  )
}

/**
 * The applicant picks all their files in one go, so we guess what each one is from its name
 * ("Mayors permit 2026.pdf" -> Mayor's permit). It is only a starting point: they can change it.
 */
export function guessDocType(fileName: string): DocTypeCode | null {
  const n = fileName.toLowerCase().replace(/[_\-.]+/g, ' ')
  const has = (...words: string[]) => words.some((w) => n.includes(w))
  if (has('barangay', 'brgy')) return 'barangay_permit'
  if (has('mayor', 'business permit', 'mayors', 'lgu')) return 'mayors_permit'
  if (has('dti', 'sec ', 'cda', 'business name')) return 'dti_registration'
  if (has('bir', '2303')) return 'bir_registration'
  if (has('fire', 'fsic')) return 'fire_safety'
  if (has('sanitary', 'sanitation')) return 'sanitary_permit'
  if (
    has(
      'title',
      'tct',
      'tax dec',
      'ownership',
      'lease',
      'contract',
      'authorization',
      'authorisation',
    )
  )
    return 'proof_ownership'
  if (
    has(
      'valid id',
      'government id',
      'driver',
      'passport',
      'umid',
      'philsys',
      'national id',
      'voter',
      'id ',
    )
  )
    return 'valid_id'
  return null
}
