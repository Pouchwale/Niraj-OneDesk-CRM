import { COMPANY_TARGET_SCHEMA, COMPANY_FIELD_ALIASES, type CompanyTargetField } from './companies-schema'
import { normalizeHeader, normalizeDate, cleanCellValue } from './file-parser'
import { parseCurrencyStrict, addDaysISO, parseISODate } from './utils'
import { normalizePhoneForStorage } from './messaging'
import { normalizeBpCode } from './bp-code'
import { deriveCompanyStatus } from './status-rules'
import {
  getAliasMap,
  resolveRowOwner,
  type CoordinatorMatch,
} from './coordinator-aliases'
import { getFallbackOwner } from '@/features/auth/AuthContext'
import { applyHandoverToRows, coordinatorNameFor } from './handover'
import { upsertCompany } from './companies-api'
import { demoCompanyStore, inBulk } from './demo-companies'
import { accountKeyOf, invoiceKeyOf } from './account-key'
import { countSettlements, guardSettlements, planSettlements, type FileAccounts } from './excel-reconcile'
import { isNoFollowup } from './no-followup'
import { getCompanies, settleCompanies, supersedeCompanies } from './companies-api'
import type { Company, CompanyStatus } from './types'
import { DAY_MS } from '@/lib/constants'

export { COMPANY_FIELD_ALIASES }

/** targetFieldKey -> source header name */
export type CompanyColumnMapping = Record<string, string>

export interface MappedCompanyRow {
  _originalIndex: number
  _raw: Record<string, unknown>
  company_name: string
  sap_bp_code: string | null
  coordinator_name: string
  coordinator_id: string | null
  /** Coordinator exactly as the file spelled it, preserved through assignment. */
  coordinator_input: string
  /** How the coordinator was identified, or null when nothing was recognised. */
  coordinator_match?: CoordinatorMatch | null
  /** The invoice number, which is what makes this row its own record. */
  invoice_no: string | null
  payment_terms: string
  total_amount: number
  invoice_date: string | null
  due_date: string | null
  contact_person: string | null
  contact_number: string | null
  email: string | null
  module: string | null
  remarks: string | null
  status: CompanyStatus
  extra_fields: Record<string, unknown>
}

export interface CompanyValidationResult {
  rows: MappedCompanyRow[]
  valid: MappedCompanyRow[]
  invalid: MappedCompanyRow[]
  unassigned: MappedCompanyRow[]
  errors: Record<number, string[]>
}

/**
 * What a sync changed, as opposed to how many rows it wrote.
 *
 * The counts of created and updated say how much work the import did. These
 * say what is different now, which is the question somebody pressing Sync is
 * actually asking.
 */
export interface SyncDelta {
  /** Records that did not exist before, and what they added to the book. */
  added: number
  addedValue: number
  /** Records whose balance moved, and by how much in total. */
  changed: number
  /** Signed: positive when the book owes more than it did. */
  delta: number
  /** Written again with nothing different about them. */
  unchanged: number
}

export interface CompanyUploadOutcome {
  created: number
  updated: number
  failed: number
  /** What moved, for the line the sync prints. */
  changes?: SyncDelta
  /** Accounts brought to nil because the file says so. */
  settled?: { paid: number; gone: number; refused?: number }
  /** Pre-invoice records the invoice book replaced. One-off, on first sync. */
  upgraded?: number
  errors: { row: number; company: string; messages: string[] }[]
  uploadId: string | null
}

/* ===================== Column auto-mapping ===================== */

/**
 * Maps source headers onto target fields. Synchronous by design - the upload
 * dialog consumes the result directly in a state setter.
 */
export function autoMapCompanyColumns(headers: string[]): CompanyColumnMapping {
  const mapping: CompanyColumnMapping = {}
  const usedHeaders = new Set<string>()

  const claim = (field: CompanyTargetField, header: string) => {
    mapping[field.key] = header
    usedHeaders.add(header)
  }

  // Pass 1 - exact match on key, label or alias.
  for (const field of COMPANY_TARGET_SCHEMA) {
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

  // Pass 2 - substring match, longest alias first so "total amount" beats "amount".
  for (const field of COMPANY_TARGET_SCHEMA) {
    if (mapping[field.key]) continue
    const aliases = [...field.aliases]
      .map(normalizeHeader)
      .filter((a) => a.length >= 4)
      .sort((a, b) => b.length - a.length)

    let matched = false
    for (const alias of aliases) {
      for (const header of headers) {
        if (usedHeaders.has(header)) continue
        const normalized = normalizeHeader(header)
        if (normalized.includes(alias) || alias.includes(normalized)) {
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

// The credit-period rules live with the due-date rule they serve. Imported
// for use here and re-exported so existing callers keep their names.
import { deriveDueDate, parsePaymentTermDays } from './due-date'
export { parsePaymentTermDays, deriveDueDate }

/**
 * Derives the follow-up status from the due date. Drives which companies show
 * up in the proactive queue vs. the overdue queue.
 */
// The rule itself lives with the other thresholds; re-exported so existing
// imports keep working.
export { deriveCompanyStatus }

/* ===================== Mapping + validation ===================== */

function textOrNull(val: unknown): string | null {
  const str = cleanCellValue(val)
  return str === '' ? null : str
}

/**
 * Projects raw sheet rows onto the target schema, deriving due date and status
 * and stashing every unmapped column in extra_fields so nothing is lost.
 */
export function mapCompanyRows(
  rawRows: Record<string, unknown>[],
  mapping: CompanyColumnMapping
): MappedCompanyRow[] {
  const mappedHeaders = new Set(Object.values(mapping))

  return rawRows.map((raw, index) => {
    const get = (key: string): unknown => {
      const header = mapping[key]
      return header ? raw[header] : null
    }

    const extra_fields: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(raw)) {
      if (!mappedHeaders.has(header)) {
        const clean = cleanCellValue(value)
        if (clean !== '') extra_fields[header] = clean
      }
    }

    const invoice_date = normalizeDate(get('invoice_date'))
    const payment_terms = cleanCellValue(get('payment_terms'))
    const due_date = deriveDueDate(invoice_date, normalizeDate(get('due_date')), payment_terms)
    // NaN, not 0, when the cell is blank or unreadable: the validator must
    // refuse the row rather than import a receivable as already paid.
    const total_amount = parseCurrencyStrict(cleanCellValue(get('total_amount'))) ?? NaN

    return {
      _originalIndex: index,
      _raw: raw,
      company_name: cleanCellValue(get('company_name')),
      // Stored the one way it is ever compared, so a re-import typed in lower
      // case updates the customer rather than creating a second one.
      sap_bp_code: normalizeBpCode(textOrNull(get('sap_bp_code'))),
      invoice_no: textOrNull(get('invoice_no')),
      coordinator_name: cleanCellValue(get('coordinator_name')),
      coordinator_id: null,
      coordinator_input: cleanCellValue(get('coordinator_name')),
      coordinator_match: null,
      payment_terms,
      total_amount,
      invoice_date,
      due_date,
      contact_person: textOrNull(get('contact_person')),
      // E.164 with the plus, so imported rows match the seeded ones; a number
      // that cannot be read is kept as typed rather than dropped.
      contact_number: normalizePhoneForStorage(textOrNull(get('contact_number'))) ?? textOrNull(get('contact_number')),
      email: textOrNull(get('email')),
      module: textOrNull(get('module')),
      remarks: textOrNull(get('remarks')),
      status: deriveCompanyStatus(due_date, total_amount),
      extra_fields,
    }
  })
}

/**
 * Validates mapped rows and resolves each coordinator name through the alias
 * table. Rows whose coordinator cannot be resolved are surfaced separately so
 * the admin can assign them inline rather than losing the row.
 */
export async function validateCompanyRows(
  rows: MappedCompanyRow[]
): Promise<CompanyValidationResult> {
  const aliasMap = await getAliasMap()
  const fallbackOwnerName = getFallbackOwner()?.full_name

  const valid: MappedCompanyRow[] = []
  const invalid: MappedCompanyRow[] = []
  const unassigned: MappedCompanyRow[] = []
  const errors: Record<number, string[]> = {}

  for (const row of rows) {
    const rowErrors: string[] = []

    if (!row.company_name) rowErrors.push('Company Name is required')
    if (!row.payment_terms) rowErrors.push('Payment Terms is required')
    if (!row.invoice_date) rowErrors.push('Invoice Date is missing or unreadable')

    if (!Number.isFinite(row.total_amount)) rowErrors.push('Total Amount is missing or unreadable')
    else if (row.total_amount < 0) rowErrors.push('Total Amount cannot be negative')
    else if (row.total_amount === 0) rowErrors.push('Total Amount must be greater than zero')

    // A confident match is applied outright; a weaker one is carried through as
    // a suggestion for the reviewer; a cell holding no name at all ("#N/A", a
    // blank, a dash) goes to the admin rather than blocking the row.
    const owner = resolveRowOwner(row.coordinator_name, aliasMap)
    row.coordinator_match = owner.match
    row.coordinator_id = owner.coordinatorId
    if (owner.routedToAdmin) row.coordinator_name = fallbackOwnerName ?? row.coordinator_name
    if (owner.error) rowErrors.push(owner.error)

    if (rowErrors.length > 0) {
      errors[row._originalIndex] = rowErrors
      invalid.push(row)
      if (rowErrors.includes('Unassigned coordinator')) unassigned.push(row)
    } else {
      valid.push(row)
    }
  }

  /*
   * A coordinator whose desk has been handed on keeps nothing. The file goes on
   * naming them every morning, so their rows are re-owned on every sync rather
   * than once - and by customer, so a customer's invoices never split across
   * two people.
   */
  applyHandoverToRows(
    rows,
    (row) => row.coordinator_id,
    (row) => row.sap_bp_code,
    (row, coordinatorId, rule) => {
      const name = coordinatorNameFor(coordinatorId)
      row.coordinator_id = coordinatorId
      if (name) row.coordinator_name = name
      row.coordinator_match = {
        coordinatorId,
        confidence: 1,
        method: 'handover',
        reason: `${coordinatorNameFor(rule.fromCoordinatorId) ?? 'That coordinator'}'s customers were handed on; this one is ${name ?? 'theirs'}`,
      }
    }
  )

  return { rows, valid, invalid, unassigned, errors }
}

/* ===================== Persistence ===================== */

function toCompanyPayload(row: MappedCompanyRow): Omit<Company, 'id' | 'created_at' | 'updated_at'> {
  return {
    sap_bp_code: row.sap_bp_code,
    name: row.company_name,
    contact_person: row.contact_person,
    invoice_no: row.invoice_no,
    contact_number: row.contact_number ?? '',
    email: row.email,
    payment_terms: row.payment_terms,
    total_amount: row.total_amount,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    status: row.status,
    assigned_coordinator_id: row.coordinator_id,
    module: row.module,
    remarks: row.remarks,
    extra_fields: row.extra_fields,
  }
}

export interface ProcessUploadOptions {
  filename?: string
  adminId?: string
  onProgress?: (fraction: number) => void
  /** Rows that failed validation, recorded to the error queue for later fixing. */
  invalidRows?: { row: MappedCompanyRow; messages: string[] }[]
  /**
   * Reconcile the book against the file as well as adding to it: settle the
   * customers the sheet says are paid, and — when it read the whole book —
   * those it no longer mentions. Left undefined by a hand-picked file upload,
   * which is a contribution to the book rather than a statement of all of it.
   */
  reconcile?: { file: FileAccounts; absent: boolean }
}

/**
 * One record per invoice, where the file says which invoice a row is.
 *
 * Active Payments is an invoice book: the export carries a row per invoice, and
 * the invoice number is what tells a customer's rows apart. Each one keeps its
 * own amount, its own due date and its own status, because that is what a
 * coordinator actually chases — "the March invoice is overdue, the June one is
 * not" is a sentence a rolled-up account cannot say.
 *
 * It used to add a customer's invoices together into a single row. The total
 * was right and everything else was lost: in the live file 1,175 open invoices
 * became 337 accounts, and 133 of those customers had invoices falling due on
 * different dates, so one date stood in for all of them and the status was
 * wrong for every invoice but one.
 *
 * The rolling-up survives as the fallback for a file with **no** invoice
 * number, where rows for one customer really are duplicates of each other and
 * would otherwise overwrite one another — the failure that put this here in the
 * first place, where a customer with 119 open invoices showed ₹24,918 of
 * ₹86,76,177. In that case the merged row takes the *earliest* open due date:
 * the money that has been waiting longest, which is what the chase order should
 * follow.
 */
export function groupImportRows(rows: MappedCompanyRow[]): MappedCompanyRow[] {
  const groups = new Map<string, MappedCompanyRow[]>()

  for (const row of rows) {
    // The invoice where the file numbers them, the customer where it does not.
    const key = invoiceKeyOf(row.sap_bp_code, row.invoice_no, row.company_name)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const merged: MappedCompanyRow[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0])
      continue
    }

    // Earliest due date first; rows without one sort last, since a date that
    // exists is more useful than one that does not.
    const ordered = [...group].sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return a._originalIndex - b._originalIndex
    })

    const lead = ordered[0]
    const total = group.reduce((sum, row) => sum + (Number.isFinite(row.total_amount) ? row.total_amount : 0), 0)

    merged.push({
      ...lead,
      total_amount: total,
      // The status follows the oldest open invoice, which is already `lead`'s.
      status: deriveCompanyStatus(lead.due_date, total),
      extra_fields: {
        ...lead.extra_fields,
        // Say so on the record, so a figure that does not match any single
        // invoice line in the sheet is explained rather than mysterious.
        'Open invoices': group.length,
      },
    })
  }

  return merged
}

/**
 * Persists validated rows, records an upload audit entry, and pushes any
 * failures into the error queue so admins can resolve them later.
 */
export async function processCompanyUpload(
  rows: MappedCompanyRow[],
  options: ProcessUploadOptions | ((fraction: number) => void) = {}
): Promise<CompanyUploadOutcome> {
  const opts: ProcessUploadOptions =
    typeof options === 'function' ? { onProgress: options } : options

  const uploadId = `upl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const outcome: CompanyUploadOutcome = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
    uploadId,
  }

  /** What actually moved, tallied as each row is written. */
  const changes: SyncDelta = { added: 0, addedValue: 0, changed: 0, delta: 0, unchanged: 0 }

  // One record per invoice, or per customer where the file numbers nothing.
  const accounts = groupImportRows(rows)
  const total = accounts.length || 1

  const touched = new Set<string>()

  // One save at the end. Persisting per row re-serialises the whole dataset
  // every time, which is what made a real workbook take a minute to import.
  await inBulk(async () => {
  for (let i = 0; i < accounts.length; i++) {
    const row = accounts[i]
    try {
      const payload = toCompanyPayload(row)
      const { id, wasCreated, before } = await upsertCompany(payload)
      touched.add(id)

      const now = payload.total_amount || 0
      if (wasCreated) {
        outcome.created++
        changes.added++
        changes.addedValue += now
      } else {
        outcome.updated++
        // A row written with the same balance is not news, and counting it as
        // an update is how a sync over an untouched file reported a thousand
        // of them.
        if (before !== null && Math.abs(now - before) > 0.005) {
          changes.changed++
          changes.delta += now - before
        } else {
          changes.unchanged++
        }
      }
    } catch (err) {
      outcome.failed++
      const message = err instanceof Error ? err.message : 'Unknown error'
      outcome.errors.push({
        row: row._originalIndex + 2,
        company: row.company_name,
        messages: [message],
      })
    }
    opts.onProgress?.((i + 1) / total)
  }

  // Rows rejected at validation time never reach the loop above; record them too.
  const invalidRows = opts.invalidRows ?? []
  for (const { row, messages } of invalidRows) {
    outcome.failed++
    outcome.errors.push({
      row: row._originalIndex + 2,
      company: row.company_name || '(empty)',
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

  // What the file no longer says is as much a fact as what it does.
  if (opts.reconcile) {
    // First retire the records the invoice book replaced, so they are neither
    // settled nor counted as money that went away.
    outcome.upgraded = await retireSupersededRecords(opts.reconcile.file)
    outcome.settled = await settleAgainstFile(opts.reconcile)
  }

  await recordUpload(uploadId, outcome, rows.length + invalidRows.length, opts, invalidRows)
  })

  opts.onProgress?.(1)
  return outcome
}

/**
 * The customers whose invoices the file numbers.
 *
 * Read back out of the keys the file produced: an invoice row keys as
 * `bp:C0012#1553`, a customer-level row as `bp:C0012`. So the presence of a
 * "#" is the file telling us it is an invoice export.
 */
function customersWithNumberedInvoices(file: FileAccounts): Set<string> {
  const numbered = new Set<string>()
  for (const key of file.present) {
    const hash = key.indexOf('#')
    if (hash > 0) numbered.add(key.slice(0, hash))
  }
  return numbered
}

/**
 * Removes the customer-level records the invoice book has replaced.
 *
 * Only where a replacement actually exists. A customer the file numbers but
 * whose invoices are all paid has no replacement record, and their old row is
 * genuinely settled - that is the settlement step's job, not this one.
 */
async function retireSupersededRecords(file: FileAccounts): Promise<number> {
  const numbered = customersWithNumberedInvoices(file)
  if (numbered.size === 0) return 0

  const records = demoCompanyStore.getAllCompanies()

  /** The invoice records now standing in for each customer, oldest first. */
  const replacements = new Map<string, Company[]>()
  for (const company of records) {
    if (!company.invoice_no) continue
    const key = accountKeyOf(company.sap_bp_code, company.name)
    const list = replacements.get(key)
    if (list) list.push(company)
    else replacements.set(key, [company])
  }

  const pairs: { oldId: string; replacementIds: string[] }[] = []
  for (const company of records) {
    if (company.invoice_no) continue
    const key = accountKeyOf(company.sap_bp_code, company.name)
    if (!numbered.has(key)) continue

    const takingOver = replacements.get(key)
    if (!takingOver || takingOver.length === 0) continue

    const ordered = [...takingOver].sort((a, b) =>
      (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')
    )
    pairs.push({ oldId: company.id, replacementIds: ordered.map((c) => c.id) })
  }

  return supersedeCompanies(pairs)
}

/**
 * Settles the accounts the workbook has stopped claiming money for.
 *
 * Deliberately reads the book back rather than working from the rows just
 * imported: the accounts that need settling are precisely the ones the import
 * did not touch, so they are only visible from this side.
 */
async function settleAgainstFile(
  reconcile: { file: FileAccounts; absent: boolean }
): Promise<{ paid: number; gone: number; refused?: number }> {
  const records = demoCompanyStore.getAllCompanies()

  const plan = planSettlements({
    records,
    file: reconcile.file,
    reconcileAbsent: reconcile.absent,
    idOf: (company) => company.id,
    keyOf: (company) => invoiceKeyOf(company.sap_bp_code, company.invoice_no, company.name),
    nameOf: (company) => company.name,
    amountOf: (company) => company.total_amount || 0,
    // Already out of the chase by somebody's decision, or already at nil.
    isProtected: (company) => company.status === 'paid' || isNoFollowup(company),
  })

  // A plan that would write down most of the book is a truncated file or a
  // keying mistake, not a month everybody paid.
  const open = records.filter((company) => company.status !== 'paid' && (company.total_amount || 0) !== 0)
  const { apply, refused } = guardSettlements(plan, open.length)

  await settleCompanies(apply.map((settlement) => settlement.id))
  return { ...countSettlements(apply), ...(refused ? { refused } : {}) }
}

async function recordUpload(
  uploadId: string,
  outcome: CompanyUploadOutcome,
  rowsTotal: number,
  opts: ProcessUploadOptions,
  invalidRows: { row: MappedCompanyRow; messages: string[] }[]
): Promise<void> {
  const uploadRecord = {
    id: uploadId,
    admin_id: opts.adminId ?? 'admin-1',
    filename: opts.filename ?? 'company-upload.xlsx',
    uploaded_at: new Date().toISOString(),
    rows_total: rowsTotal,
    rows_created: outcome.created,
    rows_updated: outcome.updated,
    rows_failed: outcome.failed,
    error_report_url: null,
  }

  demoCompanyStore.addUpload(uploadRecord)
  for (const { row, messages } of invalidRows) {
    demoCompanyStore.addUploadError({
      id: `err-${uploadId}-${row._originalIndex}`,
      upload_id: uploadId,
      row_number: row._originalIndex + 2,
      raw_data: row._raw as Record<string, unknown>,
      errors: messages,
      resolved: false,
      created_at: new Date().toISOString(),
    })
  }
  return

}
