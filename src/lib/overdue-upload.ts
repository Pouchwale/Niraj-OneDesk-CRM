import { OVERDUE_TARGET_SCHEMA, type OverdueTargetField } from './overdue-schema'
import { normalizeHeader, cleanCellValue } from './file-parser'
import { parseCurrency, parseCurrencyStrict } from './utils'
import { normalizePhoneForStorage } from './messaging'
import { normalizeBpCode, sameBpCode } from './bp-code'
import type { SyncDelta } from './companies-upload'
import {
  getAliasMap,
  resolveRowOwner,
  type CoordinatorMatch,
} from './coordinator-aliases'
import { getFallbackOwner } from '@/features/auth/AuthContext'
import { demoCompanyStore, inBulk } from './demo-companies'
import { accountKeyOf } from './account-key'
import { countSettlements, guardSettlements, planSettlements, type FileAccounts } from './excel-reconcile'
import { isNoFollowup } from './no-followup'
import { getOverduePayments, settleOverduePayments } from './overdue-api'
import type { OverduePayment, OverdueStatus } from './types'

/** targetFieldKey -> source header name */
export type OverdueColumnMapping = Record<string, string>

export interface MappedOverdueRow {
  _originalIndex: number
  _raw: Record<string, unknown>
  bp_code: string
  customer_name: string
  coordinator_name: string
  coordinator_id: string | null
  /** Coordinator exactly as the file spelled it, preserved through assignment. */
  coordinator_input: string
  /** How the coordinator was identified, or null when nothing was recognised. */
  coordinator_match?: CoordinatorMatch | null
  balance_due: number
  due_0_30: number
  due_31_60: number
  due_61_90: number
  due_91_120: number
  due_121_plus: number
  payment_terms: string | null
  contact_person: string | null
  contact_number: string | null
  email: string | null
  sales_person_name: string | null
  department: string | null
  account_type: string | null
  status: OverdueStatus
  extra_fields: Record<string, unknown>
}

export interface OverdueValidationResult {
  rows: MappedOverdueRow[]
  valid: MappedOverdueRow[]
  invalid: MappedOverdueRow[]
  unassigned: MappedOverdueRow[]
  errors: Record<number, string[]>
}

export interface OverdueUploadOutcome {
  created: number
  updated: number
  failed: number
  /** What moved, for the line the sync prints. */
  changes?: SyncDelta
  /** Rows brought to nil because the file says so. */
  settled?: { paid: number; gone: number; refused?: number }
  errors: { row: number; company: string; messages: string[] }[]
  uploadId: string | null
}

/* ===================== Column auto-mapping ===================== */

export function autoMapOverdueColumns(headers: string[]): OverdueColumnMapping {
  const mapping: OverdueColumnMapping = {}
  const usedHeaders = new Set<string>()

  const claim = (field: OverdueTargetField, header: string) => {
    mapping[field.key] = header
    usedHeaders.add(header)
  }

  // Pass 1 - exact match on key, label or alias.
  for (const field of OVERDUE_TARGET_SCHEMA) {
    if (mapping[field.key]) continue
    const candidates = [field.key, field.label, ...field.aliases].map(normalizeHeader)

    for (const header of headers) {
      if (usedHeaders.has(header)) continue
      if (candidates.includes(normalizeHeader(header))) {
        claim(field, header)
        break
      }
    }
  }

  // Pass 2 - substring match. Ageing buckets are matched first and with exact
  // digits so "0-30" never swallows the "121+" column, and longest alias wins so
  // "balance due" beats a bare "due".
  for (const field of OVERDUE_TARGET_SCHEMA) {
    if (mapping[field.key]) continue
    const aliases = [...field.aliases]
      .map(normalizeHeader)
      .filter((a) => a.length >= 4)
      .sort((a, b) => b.length - a.length)

    let matched = false
    for (const alias of aliases) {
      for (const header of headers) {
        if (usedHeaders.has(header)) continue
        if (normalizeHeader(header).includes(alias)) {
          claim(field, header)
          matched = true
          break
        }
      }
      if (matched) break
    }
  }

  return mapping
}

/* ===================== Derivations ===================== */

/**
 * Anything sitting in the 90+ ageing buckets is treated as critical; the rest is
 * ordinary overdue. A zero balance is already settled.
 */
export function deriveOverdueStatus(row: {
  balance_due: number
  due_91_120: number
  due_121_plus: number
}): OverdueStatus {
  // Nothing owed is settled. Being in credit is not: the position is open,
  // it just runs the other way, so it stays visible and counts in the totals.
  if (row.balance_due === 0) return 'settled'
  if (row.due_91_120 > 0 || row.due_121_plus > 0) return 'critical'
  return 'overdue'
}

/* ===================== Mapping + validation ===================== */

function textOrNull(val: unknown): string | null {
  const str = cleanCellValue(val)
  return str === '' ? null : str
}

export function mapOverdueRows(
  rawRows: Record<string, unknown>[],
  mapping: OverdueColumnMapping
): MappedOverdueRow[] {
  const mappedHeaders = new Set(Object.values(mapping))

  return rawRows.map((raw, index) => {
    const get = (key: string): unknown => {
      const header = mapping[key]
      return header ? raw[header] : null
    }
    const num = (key: string): number => parseCurrency(cleanCellValue(get(key)))

    const extra_fields: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(raw)) {
      if (!mappedHeaders.has(header)) {
        const clean = cleanCellValue(value)
        if (clean !== '') extra_fields[header] = clean
      }
    }

    const buckets = {
      due_0_30: num('due_0_30'),
      due_31_60: num('due_31_60'),
      due_61_90: num('due_61_90'),
      due_91_120: num('due_91_120'),
      due_121_plus: num('due_121_plus'),
    }

    // Some exports omit a total column; fall back to the sum of the buckets.
    // A total that is present but unreadable is a different matter: it must
    // fail validation rather than be quietly replaced by the buckets.
    const bucketTotal = Object.values(buckets).reduce((sum, v) => sum + v, 0)
    const reportedCell = cleanCellValue(get('balance_due'))
    const reported = reportedCell === '' ? 0 : (parseCurrencyStrict(reportedCell) ?? NaN)
    const balance_due = reported > 0 ? reported : Number.isNaN(reported) ? NaN : bucketTotal

    return {
      _originalIndex: index,
      _raw: raw,
      // Stored the one way it is ever compared, so "bp-3002" and "BP-3002"
      // are the same customer on every screen.
      bp_code: normalizeBpCode(cleanCellValue(get('bp_code'))) ?? '',
      customer_name: cleanCellValue(get('customer_name')),
      coordinator_name: cleanCellValue(get('coordinator_name')),
      coordinator_id: null,
      coordinator_input: cleanCellValue(get('coordinator_name')),
      coordinator_match: null,
      balance_due,
      ...buckets,
      payment_terms: textOrNull(get('payment_terms')),
      contact_person: textOrNull(get('contact_person')),
      contact_number: normalizePhoneForStorage(textOrNull(get('contact_number'))) ?? textOrNull(get('contact_number')),
      email: textOrNull(get('email')),
      sales_person_name: textOrNull(get('sales_person_name')),
      department: textOrNull(get('department')),
      account_type: textOrNull(get('account_type')),
      status: deriveOverdueStatus({ balance_due, ...buckets }),
      extra_fields,
    }
  })
}

export async function validateOverdueRows(
  rows: MappedOverdueRow[]
): Promise<OverdueValidationResult> {
  const aliasMap = await getAliasMap()
  const fallbackOwnerName = getFallbackOwner()?.full_name

  const valid: MappedOverdueRow[] = []
  const invalid: MappedOverdueRow[] = []
  const unassigned: MappedOverdueRow[] = []
  const errors: Record<number, string[]> = {}

  for (const row of rows) {
    const rowErrors: string[] = []

    if (!row.bp_code) rowErrors.push('BP Code is required')
    if (!row.customer_name) rowErrors.push('Customer Name is required')

    // A negative balance is a credit note or an advance, not a bad row: the
    // customer is in credit. It imports as it stands and nets off the totals.
    if (!Number.isFinite(row.balance_due)) rowErrors.push('Balance Due is missing or unreadable')

    // A confident match is applied outright; a weaker one is carried through as
    // a suggestion for the reviewer; a cell holding no name at all ("#N/A", a
    // blank, a dash) goes to the admin rather than blocking the row.
    const owner = resolveRowOwner(row.coordinator_name, aliasMap)
    row.coordinator_match = owner.match
    row.coordinator_id = owner.coordinatorId
    if (owner.routedToAdmin) row.coordinator_name = fallbackOwnerName ?? row.coordinator_name
    // A name nobody logs in as imports with no CRM owner and keeps the file's
    // name, rather than being refused and leaving its money off every screen.
    const unknownName = owner.error === 'Unassigned coordinator'
    if (owner.error && !unknownName) rowErrors.push(owner.error)
    if (unknownName) unassigned.push(row)

    if (rowErrors.length > 0) {
      errors[row._originalIndex] = rowErrors
      invalid.push(row)
    } else {
      valid.push(row)
    }
  }

  return { rows, valid, invalid, unassigned, errors }
}

/* ===================== Persistence ===================== */

function toPayload(row: MappedOverdueRow): Omit<OverduePayment, 'id' | 'created_at' | 'updated_at'> {
  return {
    bp_code: row.bp_code,
    customer_name: row.customer_name,
    balance_due: row.balance_due,
    due_0_30: row.due_0_30,
    due_31_60: row.due_31_60,
    due_61_90: row.due_61_90,
    due_91_120: row.due_91_120,
    due_121_plus: row.due_121_plus,
    payment_terms: row.payment_terms,
    contact_person: row.contact_person,
    contact_number: row.contact_number,
    email: row.email,
    coordinator_name: row.coordinator_name,
    sales_person_name: row.sales_person_name,
    department: row.department,
    account_type: row.account_type,
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: row.coordinator_id,
    status: row.status,
    extra_fields: row.extra_fields,
    imported_at: new Date().toISOString(),
  }
}

export interface ProcessOverdueUploadOptions {
  filename?: string
  adminId?: string
  onProgress?: (fraction: number) => void
  invalidRows?: { row: MappedOverdueRow; messages: string[] }[]
  /**
   * Reconcile the book against the file as well as adding to it: settle the
   * customers the sheet says are paid, and — when it read the whole book —
   * those it no longer mentions. Left undefined by a hand-picked file upload,
   * which is a contribution to the book rather than a statement of all of it.
   */
  reconcile?: { file: FileAccounts; absent: boolean }
}

/**
 * Settles the rows the ageing report has stopped listing.
 *
 * A bankrupt customer is left alone: that debt is still owed, and a row
 * dropping out of tomorrow's export is not the same as somebody collecting it.
 */
async function settleAgainstFile(
  reconcile: { file: FileAccounts; absent: boolean }
): Promise<{ paid: number; gone: number; refused?: number }> {
  const records = demoCompanyStore.getAllOverduePayments()

  const plan = planSettlements({
    records,
    file: reconcile.file,
    reconcileAbsent: reconcile.absent,
    idOf: (row) => row.id,
    keyOf: (row) => accountKeyOf(row.bp_code, row.customer_name),
    nameOf: (row) => row.customer_name || row.bp_code,
    amountOf: (row) => row.balance_due || 0,
    isProtected: (row) =>
      row.status === 'settled' || row.status === 'bankrupt' || isNoFollowup(row),
  })

  const open = records.filter((row) => row.status !== 'settled' && (row.balance_due || 0) !== 0)
  const { apply, refused } = guardSettlements(plan, open.length)

  await settleOverduePayments(apply.map((settlement) => settlement.id))
  return { ...countSettlements(apply), ...(refused ? { refused } : {}) }
}

export async function processOverdueUpload(
  rows: MappedOverdueRow[],
  options: ProcessOverdueUploadOptions = {}
): Promise<OverdueUploadOutcome> {
  const uploadId = `upl-ovd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const outcome: OverdueUploadOutcome = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
    uploadId,
  }

  /** What actually moved, tallied as each row is written. */
  const changes: SyncDelta = { added: 0, addedValue: 0, changed: 0, delta: 0, unchanged: 0 }

  const total = rows.length || 1

  const touched = new Set<string>()

  // One save at the end: without this every row re-serialises the whole
  // dataset, and a real ageing file took the best part of a minute.
  await inBulk(async () => {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const written = toPayload(row)
      const { id, wasCreated, before } = await upsertOverduePayment(written)
      if (id) touched.add(id)
      const now = written.balance_due || 0
      if (wasCreated) {
        outcome.created++
        changes.added++
        changes.addedValue += now
      } else {
        outcome.updated++
        // A row written with the same balance is not news.
        if (before !== null && Math.abs(now - before) > 0.005) {
          changes.changed++
          changes.delta += now - before
        } else {
          changes.unchanged++
        }
      }
    } catch (err) {
      outcome.failed++
      outcome.errors.push({
        row: row._originalIndex + 2,
        company: row.customer_name || row.bp_code,
        messages: [err instanceof Error ? err.message : 'Unknown error'],
      })
    }
    options.onProgress?.((i + 1) / total)
  }

  for (const { row, messages } of options.invalidRows ?? []) {
    outcome.failed++
    outcome.errors.push({
      row: row._originalIndex + 2,
      company: row.customer_name || row.bp_code || '(empty)',
      messages,
    })
  }

  // Real data has arrived, so the shipped demo customers are no longer a
  // demonstration — they are wrong figures inside somebody else's book.
  // Dropped before the file is reconciled against, so a shipped fixture is
  // never reported as a customer who settled.
  if (outcome.created + outcome.updated > 0) {
    demoCompanyStore.dropUntouchedSeeds(touched)
  }

  outcome.changes = changes

  // A row the ageing report has stopped listing has been collected.
  if (options.reconcile) {
    outcome.settled = await settleAgainstFile(options.reconcile)
  }

  await recordOverdueUpload(uploadId, outcome, rows.length, options)
  })

  options.onProgress?.(1)
  return outcome
}

async function upsertOverduePayment(
  payload: Omit<OverduePayment, 'id' | 'created_at' | 'updated_at'>
): Promise<{ id: string | null; wasCreated: boolean; before: number | null }> {
  // Read before the write, which is the only moment it still exists.
  const was = demoCompanyStore.getAllOverduePayments().find((p) => sameBpCode(p.bp_code, payload.bp_code))
  const before = was ? was.balance_due ?? 0 : null
  const { payment, wasCreated } = demoCompanyStore.upsertOverduePayment(payload as OverduePayment)
  return { id: payment.id, wasCreated, before }

}

async function recordOverdueUpload(
  uploadId: string,
  outcome: OverdueUploadOutcome,
  rowsTotal: number,
  options: ProcessOverdueUploadOptions
): Promise<void> {
  const invalidRows = options.invalidRows ?? []
  const record = {
    admin_id: options.adminId ?? 'admin-1',
    filename: options.filename ?? 'overdue-upload.xlsx',
    uploaded_at: new Date().toISOString(),
    rows_total: rowsTotal + invalidRows.length,
    rows_created: outcome.created,
    rows_updated: outcome.updated,
    rows_failed: outcome.failed,
    error_report_url: null,
    dataset: 'overdue_payments',
  }

  demoCompanyStore.addUpload({ ...record, id: uploadId } as never)
  for (const { row, messages } of invalidRows) {
    demoCompanyStore.addUploadError({
      id: `err-${uploadId}-${row._originalIndex}`,
      upload_id: uploadId,
      row_number: row._originalIndex + 2,
      raw_data: row._raw,
      errors: messages,
      resolved: false,
      created_at: new Date().toISOString(),
    })
  }
  return

}
