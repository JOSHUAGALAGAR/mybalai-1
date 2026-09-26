/** Minimal CSV writer (RFC 4180) that also defuses spreadsheet formula injection. */

export type CsvCell = string | number | boolean | null | undefined

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // A cell starting with = + - @ (or tab / CR) is executed as a formula by Excel / Sheets.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','))
  // BOM so Excel opens UTF-8 (₱, ñ) correctly.
  return `﻿${lines.join('\r\n')}\r\n`
}
