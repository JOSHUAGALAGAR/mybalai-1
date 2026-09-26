import { randomInt } from 'node:crypto'

/** Letters and digits without look-alikes (no 0/O, 1/l/I). */
const PASSWORD_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** A random one-time password an admin can read out or paste to someone. */
export function temporaryPassword(length = 12): string {
  return Array.from(
    { length },
    () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)],
  ).join('')
}
