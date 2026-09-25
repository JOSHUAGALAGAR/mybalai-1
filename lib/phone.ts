import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/**
 * Philippine phone numbers for a property's contact number.
 *
 * Accepts a mobile (0917 123 4567, +63 917 123 4567, 9171234567) or a landline with its area code
 * ((02) 8123 4567, 032 234 5678), and answers with one clean form: "+63 917 123 4567". Checked
 * against the real numbering plan (libphonenumber), so 0900 000 0000, 12345 or a US number are
 * refused. No outside service is called.
 */

export const PH_PHONE_MESSAGE =
  'Enter a valid Philippine number, like 0917 123 4567 (mobile) or (02) 8123 4567 (landline).'

export type PhPhone =
  | { ok: true; display: string; e164: string; kind: 'mobile' | 'landline' }
  | { ok: false; message: string }

// Digits and the punctuation people type; nothing else (no letters, so no "call me" or vanity numbers).
const ALLOWED = /^[+\d\s().-]+$/

export function parsePhPhone(input: string): PhPhone {
  const text = input.trim()
  if (!text || text.length > 30 || !ALLOWED.test(text)) {
    return { ok: false, message: PH_PHONE_MESSAGE }
  }
  const phone = parsePhoneNumberFromString(text, 'PH')
  if (!phone || phone.country !== 'PH' || !phone.isValid()) {
    return { ok: false, message: PH_PHONE_MESSAGE }
  }
  const type = phone.getType()
  const kind =
    type === 'MOBILE'
      ? 'mobile'
      : type === 'FIXED_LINE' || type === 'FIXED_LINE_OR_MOBILE'
        ? 'landline'
        : null
  if (!kind) return { ok: false, message: PH_PHONE_MESSAGE }
  return {
    ok: true,
    display: phone.formatInternational(),
    e164: phone.number,
    kind,
  }
}
