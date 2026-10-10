/**
 * Who an account belongs to, in words - and how to filter by it.
 *
 * The workbook's coordinator column names people who have no login here
 * (a salesperson, a new joiner, "other"). Those rows used to be refused at
 * import, so their money sat in no total and on no screen: "waiting on a
 * coordinator name". They now import with no CRM owner but keep the name the
 * file gave them, and every screen names them the same way:
 *
 *   - booked to a CRM user            -> that user's name
 *   - booked to nobody, file names one -> the file's name, marked "not in CRM"
 *   - booked to nobody, no name at all -> "Unassigned"
 *
 * Coordinators never see these rows (the server sends a coordinator only what
 * is booked to them); the team leader and the administrator see all of them.
 */

import { isMissingCoordinator } from './coordinator-aliases'

export interface OwnedRow {
  assigned_coordinator_id: string | null
  /** The coordinator exactly as the Excel file spelled it. */
  coordinator_name?: string | null
}

export interface Owner {
  /** Stable filter key: `id:<user>`, `file:<name>` or `none`. */
  key: string
  name: string
  /** Booked to someone with a login. */
  inCrm: boolean
}

export const OWNER_ALL = 'all'
/** Every row whose owner has no CRM login, whatever the file called them. */
export const OWNER_NOT_IN_CRM = 'not_in_crm'
export const OWNER_NONE_KEY = 'none'

/** Same person however the file capitalised or spaced them. */
function fileKey(name: string): string {
  return `file:${name.trim().replace(/\s+/g, ' ').toLowerCase()}`
}

export function ownerOf(
  row: OwnedRow,
  userName: (id: string) => string | undefined,
  /**
   * A user by exact full name, for a row booked to an id that no longer
   * exists (an account re-created under a new id) whose file name is
   * someone who does log in: that is still their row, not an unknown name.
   */
  userIdByName?: (name: string) => string | undefined
): Owner {
  const id = row.assigned_coordinator_id
  const known = id ? userName(id) : undefined
  if (id && known) return { key: `id:${id}`, name: known, inCrm: true }

  const fromFile = (row.coordinator_name ?? '').trim().replace(/\s+/g, ' ')
  const sameNameId = fromFile ? userIdByName?.(fromFile) : undefined
  const sameName = sameNameId ? userName(sameNameId) : undefined
  if (sameNameId && sameName) return { key: `id:${sameNameId}`, name: sameName, inCrm: true }
  if (fromFile && !isMissingCoordinator(fromFile)) {
    return { key: fileKey(fromFile), name: fromFile, inCrm: false }
  }
  return { key: OWNER_NONE_KEY, name: 'Unassigned', inCrm: false }
}

export function matchesOwner(owner: Owner, filter: string): boolean {
  if (!filter || filter === OWNER_ALL) return true
  if (filter === OWNER_NOT_IN_CRM) return !owner.inCrm
  return owner.key === filter
}

export interface OwnerOption extends Owner {
  rows: number
  amount: number
}

/**
 * One option per owner found in the rows, with how many rows and how much
 * money each holds. CRM users first, then the names the file uses that nobody
 * here logs in as, each alphabetically.
 */
export function ownerOptions<T extends OwnedRow>(
  rows: readonly T[],
  ownerOfRow: (row: T) => Owner,
  amountOf: (row: T) => number
): OwnerOption[] {
  // Added in paise, so a long list of part-paid invoices totals exactly.
  const byKey = new Map<string, { owner: Owner; rows: number; paise: number }>()
  for (const row of rows) {
    const owner = ownerOfRow(row)
    const entry = byKey.get(owner.key) ?? { owner, rows: 0, paise: 0 }
    entry.rows++
    entry.paise += Math.round((amountOf(row) || 0) * 100)
    byKey.set(owner.key, entry)
  }
  return [...byKey.values()]
    .map(({ owner, rows: count, paise }) => ({ ...owner, rows: count, amount: paise / 100 }))
    .sort((a, b) => Number(b.inCrm) - Number(a.inCrm) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}
