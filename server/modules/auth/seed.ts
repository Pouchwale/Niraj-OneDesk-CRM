/**
 * The passwords the accounts start with.
 *
 * The ones the team already uses, so nobody has to be told a new password on
 * the day this goes in. They are hashed the first time the server starts and
 * this list is never read again — changing a password here does nothing once
 * the account file exists; change it in the Admin Panel.
 *
 * Deliberately on the server only. Anything in shared/ or src/ is also in the
 * browser bundle, where a password list has no business being.
 */

export const INITIAL_PASSWORDS: Record<string, string> = {
  'admin-0': 'Admin@123',
  'admin-1': 'Niki@123',
  'coord-1': 'Pragati@123',
  'coord-3': 'Devyani@123',
  'coord-2': 'Diya@123',
  'coord-8': 'Disha@123',
  'coord-4': 'Foram@123',
  'coord-5': 'Krupa@123',
  'coord-9': 'Vishva@123',
  'coord-7': 'Krina@123',
  'coord-6': 'Aniketa@123',
  'coord-10': 'Disha@123',
  'coord-11': 'Avani@123',
}

/** Used for an account added later without one, so it is never left open. */
export const FALLBACK_PASSWORD = 'Welcome@123'
