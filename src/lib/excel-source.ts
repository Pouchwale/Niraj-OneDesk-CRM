/**
 * Importing from the Excel file the server is watching.
 *
 * The bytes come from the API, then go through the very same parser, column
 * mapping, validation and persistence as a file dragged into the upload
 * dialog. Nothing about a synced row is special: coordinators are resolved the
 * same way, statuses derived the same way, bad rows are counted the same way,
 * and a re-import updates by BP code rather than duplicating.
 *
 * The shapes and route names come from `@shared/api`, which the server
 * implements, so this file cannot drift away from what it is calling.
 */

import { EXCEL_HEADERS, ROUTES, type ExcelBook, type ExcelBookStatus, type ExcelStatusResponse } from '@shared/api'
import { BOOK_LABEL, BOOK_PATH_ENV, EXCEL_BOOKS } from '@shared/api'
import type { SyncDelta } from './companies-upload'
import { formatCurrency } from './utils'
import { ApiRequestError, apiGet, apiGetRaw } from './api-client'
import { parseFile } from './file-parser'
import {
  autoMapCompanyColumns,
  mapCompanyRows,
  processCompanyUpload,
  validateCompanyRows,
} from './companies-upload'
import {
  autoMapOverdueColumns,
  mapOverdueRows,
  processOverdueUpload,
  validateOverdueRows,
} from './overdue-upload'
import { affectsBook, keepByAge, keepByDate, loadImportFilter, type ImportFilter } from './excel-filter'
import { readFileAccounts, type FileAccounts } from './excel-reconcile'
import { accountKeyOf, invoiceKeyOf } from './account-key'

export { BOOK_LABEL, BOOK_PATH_ENV, EXCEL_BOOKS }
export type { ExcelBook, ExcelBookStatus }

const UNCONFIGURED = (book: ExcelBook): ExcelBookStatus => ({
  book,
  configured: false,
  name: null,
  exists: false,
  modifiedAt: null,
  size: null,
  sheet: null,
  error: null,
})

/** Which workbooks are connected, and when each last changed. */
export async function getExcelStatus(): Promise<Record<ExcelBook, ExcelBookStatus>> {
  try {
    const data = await apiGet<ExcelStatusResponse>(ROUTES.excelStatus)
    return {
      companies: data.books?.companies ?? UNCONFIGURED('companies'),
      overdue: data.books?.overdue ?? UNCONFIGURED('overdue'),
    }
  } catch {
    // No server behind the page (a static preview, say): nothing is connected.
    return { companies: UNCONFIGURED('companies'), overdue: UNCONFIGURED('overdue') }
  }
}

interface FetchedWorkbook {
  file: File
  modifiedAt: string | null
  sheet: string | null
}

async function fetchWorkbook(book: ExcelBook): Promise<FetchedWorkbook> {
  let res: Response
  try {
    res = await apiGetRaw(`${ROUTES.excelFile}?book=${book}`)
  } catch (err) {
    if (err instanceof ApiRequestError) throw new Error(err.message)
    throw err
  }

  const name = decodeURIComponent(res.headers.get(EXCEL_HEADERS.name) ?? 'workbook.xlsx')
  const sheetHeader = res.headers.get(EXCEL_HEADERS.sheet)
  const blob = await res.blob()
  return {
    // Wrapped as a File so the shared parser needs no separate code path.
    file: new File([blob], name, { type: blob.type }),
    modifiedAt: res.headers.get(EXCEL_HEADERS.modifiedAt) || null,
    sheet: sheetHeader ? decodeURIComponent(sheetHeader) : null,
  }
}

/** The columns a book cannot be imported without. */
const REQUIRED: Record<ExcelBook, readonly string[]> = {
  companies: ['company_name', 'coordinator_name', 'total_amount'],
  overdue: ['bp_code', 'customer_name', 'coordinator_name', 'balance_due'],
}

/** The ageing report's buckets: no invoice sheet carries these. */
const BUCKETS = ['due_0_30', 'due_31_60', 'due_61_90', 'due_91_120', 'due_121_plus'] as const

/**
 * How well one sheet fits one book.
 *
 * This is what lets a workbook holding an Active Payments tab and an ageing tab
 * be imported twice — once per module — without naming either tab.
 *
 * Required columns alone are not enough to tell the two apart: an invoice sheet
 * has a BP code, a customer, a coordinator and an amount, so it scores full
 * marks as an ageing sheet and, being the larger tab, wins the tie. What
 * actually separates them is what only one of them can have — the five ageing
 * buckets on one side, an invoice or due date on the other — so those decide
 * it, and count against the book they do not belong to.
 */
export function scoreSheetFor(book: ExcelBook, headers: string[]): number {
  const asCompany = autoMapCompanyColumns(headers) as Record<string, string | undefined>
  const asOverdue = autoMapOverdueColumns(headers) as Record<string, string | undefined>

  const mapping = book === 'overdue' ? asOverdue : asCompany
  const required = REQUIRED[book].filter((key) => mapping[key]).length
  const buckets = BUCKETS.filter((key) => asOverdue[key]).length
  const dated = (asCompany.invoice_date ? 1 : 0) + (asCompany.due_date ? 1 : 0)

  return book === 'overdue' ? required + 3 * buckets - 2 * dated : required + 2 * dated - 3 * buckets
}

/**
 * Why the rows that did not import were left out.
 *
 * "3,012 skipped" reads like three thousand problems. Nearly all of it is the
 * system correctly ignoring invoices that are already paid, and only a small
 * part is work for a person. Counting them separately is the difference
 * between an alarming number and an actionable one.
 */
export interface SkipBreakdown {
  /** Nothing left to chase: a fully paid invoice, or a nil balance. */
  settled: number
  /** Real money, but the sheet names somebody the CRM does not know. */
  needsCoordinator: number
  /** Missing a BP code, an unreadable amount — a row somebody must fix. */
  malformed: number
}

export interface ExcelSyncResult {
  success: boolean
  created: number
  updated: number
  /** Rows the validator refused. */
  skipped: number
  /** What those rows were refused for. */
  skippedBecause?: SkipBreakdown
  /** Rows left out on purpose by the date window — not failures. */
  filteredOut?: number
  /**
   * Accounts brought to nil because the file stopped claiming money for them:
   * `paid` where the sheet still lists them at zero, `gone` where it no
   * longer lists them at all.
   */
  settled?: { paid: number; gone: number; refused?: number }
  /** Pre-invoice records the invoice book replaced. One-off, on first sync. */
  upgraded?: number
  /** What moved against what was already here: new, changed, and by how much. */
  changes?: SyncDelta
  /**
   * Rows imported with no CRM owner because the file names someone with no
   * login here. In every total; listed under "Not in CRM" in the filters.
   */
  withoutCoordinator?: number
  /** The file's timestamp at the moment it was read. */
  modifiedAt: string | null
  sheetName?: string
  error?: string
}

/** A row is settled if it holds no money, whatever else is wrong with it. */
const SETTLED_MESSAGE = /greater than zero/i

/**
 * Sorts the refused rows into the three things they can be.
 *
 * A paid invoice with an unknown coordinator counts as paid: there is nothing
 * to chase, so naming its coordinator would not import it either.
 */
export function explainSkips(
  invalid: { _originalIndex: number }[],
  unassigned: { _originalIndex: number }[],
  errors: Record<number, string[]>
): SkipBreakdown {
  const unassignedRows = new Set(unassigned.map((row) => row._originalIndex))
  const breakdown: SkipBreakdown = { settled: 0, needsCoordinator: 0, malformed: 0 }

  for (const row of invalid) {
    const messages = errors[row._originalIndex] ?? []
    if (messages.some((message) => SETTLED_MESSAGE.test(message))) breakdown.settled++
    // An unknown name alone no longer refuses a row (it imports with no CRM
    // owner), so a refused row that also has one is refused for something else.
    else if (unassignedRows.has(row._originalIndex) && messages.every((m) => m === 'Unassigned coordinator')) breakdown.needsCoordinator++
    else breakdown.malformed++
  }

  return breakdown
}

const FAILED = (error: string, modifiedAt: string | null = null): ExcelSyncResult => ({
  success: false,
  created: 0,
  updated: 0,
  skipped: 0,
  modifiedAt,
  error,
})

/**
 * Reads the connected workbook and imports it.
 *
 * Missing required columns stop the import before anything is written: a
 * partial import of a mis-mapped sheet is worse than none.
 */
export async function syncBookFromExcel(
  book: ExcelBook,
  options: { adminId?: string; filter?: ImportFilter } = {}
): Promise<ExcelSyncResult> {
  const filter = options.filter ?? loadImportFilter(book)

  let workbook: FetchedWorkbook
  try {
    workbook = await fetchWorkbook(book)
  } catch (err) {
    return FAILED(err instanceof Error ? err.message : 'Could not read the Excel file.')
  }

  try {
    // With the tab named, that tab. Without it — one workbook holding both
    // books is common — each module picks the tab whose columns it recognises,
    // so a missing sheet setting is untidy rather than an import of the wrong
    // half of the file.
    const parsed = await parseFile(workbook.file, {
      ...(workbook.sheet ? { sheetName: workbook.sheet } : {}),
      scoreSheet: (sheet) => scoreSheetFor(book, sheet.headers),
    })
    if (parsed.rows.length === 0) {
      return FAILED(`Sheet "${parsed.sheetName}" has no data rows.`, workbook.modifiedAt)
    }

    const filename = `excel-sync: ${workbook.file.name}`
    const common = { filename, adminId: options.adminId, sheetName: parsed.sheetName }

    if (book === 'overdue') {
      const mapping = autoMapOverdueColumns(parsed.headers)
      const missing = (['bp_code', 'customer_name', 'coordinator_name', 'balance_due'] as const).filter(
        (key) => !mapping[key]
      )
      if (missing.length > 0) {
        return FAILED(columnMessage(missing, parsed.sheetName), workbook.modifiedAt)
      }

      // The ageing sheet carries no date, so its only sense of time is how old
      // the money is. Filtered before validation: a row nobody asked for should
      // not land in the error queue either.
      const all = mapOverdueRows(parsed.rows, mapping)
      const wanted = all.filter((row) => keepByAge(row, filter))

      // Only a sync that read the whole book may act on what the book leaves
      // out; a filtered one is a slice, and silence in a slice means nothing.
      const reconcile = affectsBook(filter, book)
        ? undefined
        : {
            file: readFileAccounts(
              all,
              (row) => accountKeyOf(row.bp_code, row.customer_name),
              (row) => row.balance_due
            ) satisfies FileAccounts,
            absent: true,
          }

      const validation = await validateOverdueRows(wanted)
      const outcome = await processOverdueUpload(validation.valid, {
        filename,
        adminId: options.adminId,
        invalidRows: validation.invalid.map((row) => ({
          row,
          messages: validation.errors[row._originalIndex] ?? ['Unknown validation error'],
        })),
        reconcile,
      })
      return {
        success: true,
        ...counts(outcome),
        settled: outcome.settled,
        changes: outcome.changes,
        withoutCoordinator: importedWithoutOwner(validation),
        skippedBecause: explainSkips(validation.invalid, validation.unassigned, validation.errors),
        filteredOut: all.length - wanted.length,
        modifiedAt: workbook.modifiedAt,
        sheetName: common.sheetName,
      }
    }

    const mapping = autoMapCompanyColumns(parsed.headers)
    const missing = (['company_name', 'coordinator_name', 'total_amount'] as const).filter(
      (key) => !mapping[key]
    )
    if (missing.length > 0) {
      return FAILED(columnMessage(missing, parsed.sheetName), workbook.modifiedAt)
    }

    // Filtered per invoice row, before the customer's rows are added together,
    // so an account's balance is the sum of the invoices inside the window
    // rather than the whole relationship trimmed afterwards.
    const all = mapCompanyRows(parsed.rows, mapping)
    const wanted = all.filter((row) => keepByDate(row, filter))

    /*
     * Keyed by invoice, because that is what a record is here. Keying this by
     * customer while the records are invoices meant no record ever matched
     * what the file said, so a sync settled every single one of them - 1,011
     * invoices written down to nil, and the toast cheerfully reported it.
     *
     * The whole sheet, not the filtered slice: an invoice is only settled when
     * the file itself carries it at nil, or has stopped carrying it.
     */
    const reconcile = affectsBook(filter, book)
      ? undefined
      : {
          file: readFileAccounts(
            all,
            (row) => invoiceKeyOf(row.sap_bp_code, row.invoice_no, row.company_name),
            (row) => row.total_amount
          ) satisfies FileAccounts,
          absent: true,
        }

    const validation = await validateCompanyRows(wanted)
    const outcome = await processCompanyUpload(validation.valid, {
      filename,
      adminId: options.adminId,
      invalidRows: validation.invalid.map((row) => ({
        row,
        messages: validation.errors[row._originalIndex] ?? ['Unknown validation error'],
      })),
      reconcile,
    })
    return {
      success: true,
      ...counts(outcome),
      settled: outcome.settled,
      upgraded: outcome.upgraded,
      changes: outcome.changes,
      withoutCoordinator: importedWithoutOwner(validation),
      skippedBecause: explainSkips(validation.invalid, validation.unassigned, validation.errors),
      filteredOut: all.length - wanted.length,
      modifiedAt: workbook.modifiedAt,
      sheetName: common.sheetName,
    }
  } catch (err) {
    return FAILED(err instanceof Error ? err.message : 'Could not read that workbook.', workbook.modifiedAt)
  }
}

/** Rows that imported although the file names nobody with a login here. */
function importedWithoutOwner(validation: {
  valid: { _originalIndex: number }[]
  unassigned: { _originalIndex: number }[]
}): number {
  const valid = new Set(validation.valid.map((row) => row._originalIndex))
  return validation.unassigned.filter((row) => valid.has(row._originalIndex)).length
}

function counts(outcome: { created: number; updated: number; failed: number }) {
  return { created: outcome.created, updated: outcome.updated, skipped: outcome.failed }
}

/** Names the columns the sheet is missing, in the words the schema uses. */
export function columnMessage(missing: readonly string[], sheetName: string): string {
  const names = missing.map((key) => COLUMN_NAMES[key] ?? key)
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Sheet "${sheetName}" has no ${list} column${names.length === 1 ? '' : 's'}. Nothing was imported.`
}

const COLUMN_NAMES: Record<string, string> = {
  bp_code: 'BP Code',
  customer_name: 'Customer Name',
  coordinator_name: 'Coordinator',
  balance_due: 'Balance Due',
  company_name: 'Company Name',
  total_amount: 'Total Amount',
}

/**
 * What is different from what was already here.
 *
 * The counts of created and updated describe the import's own effort: they say
 * "1,011 updated" over a workbook nobody has touched since yesterday, because
 * 1,011 rows were indeed written. This says what changed — how many records are
 * new, how many moved, and whether the book owes more or less than it did.
 *
 * Silent when nothing moved, so the caller can decide whether "no change" is
 * worth a line of its own.
 */
export function describeChanges(changes?: SyncDelta): string | null {
  if (!changes) return null
  if (changes.added === 0 && changes.changed === 0) return null

  const parts: string[] = []
  if (changes.added > 0) {
    parts.push(
      `${changes.added.toLocaleString('en-IN')} new worth ${formatCurrency(changes.addedValue)}`
    )
  }
  if (changes.changed > 0) {
    // The sign is the point: a book that shrank and a book that grew are not
    // the same news, and "changed" alone hides which happened.
    const direction = changes.delta >= 0 ? 'more' : 'less'
    parts.push(
      `${changes.changed.toLocaleString('en-IN')} changed (${formatCurrency(Math.abs(changes.delta))} ${direction})`
    )
  }
  return parts.join(' · ')
}

/**
 * What the sync did, in terms that say whether anything needs doing.
 *
 * A bare "3,012 skipped" is alarming and useless: almost all of it is invoices
 * that are already paid, which is the system working. Only the rows held up by
 * something a person can fix are worth their attention, so those are named and
 * the rest is described as what it is.
 */
export function describeSync(result: ExcelSyncResult, book: ExcelBook): string {
  if (!result.success) return result.error ?? 'The sync failed.'

  /*
   * The headline is what is different, not how many rows were written.
   *
   * It used to lead with "1,011 updated", which is true of the import's own
   * effort and says the same thing over a workbook nobody has touched since
   * yesterday. Somebody pressing Sync is asking what changed, so that is what
   * it answers: what is new, what moved and by how much, what was settled.
   */
  const parts: string[] = []
  const moved = describeChanges(result.changes)
  if (moved) parts.push(moved)

  // Money leaving the totals is the one change nobody should have to discover
  // for themselves, so it is counted in the headline rather than the notes.
  const settled = (result.settled?.paid ?? 0) + (result.settled?.gone ?? 0)
  if (settled) {
    parts.push(`${settled.toLocaleString('en-IN')} settled`)
  }

  // Said plainly rather than left blank: a sync that found nothing to do is a
  // useful answer, and an empty line reads as one that never ran.
  const rows = parts.length ? parts.join(' · ') : 'nothing changed'

  const notes: string[] = []

  // A one-off on the first sync after Active Payments became an invoice
  // book. Said plainly, because a count of records disappearing without a
  // word is exactly the kind of thing that costs people their trust in it.
  if (result.upgraded) {
    notes.push(
      `${result.upgraded.toLocaleString('en-IN')} older customer-level records replaced by their invoices`
    )
  }

  // Held back rather than applied, and said first: this is the sync telling
  // somebody their file is probably not the whole book.
  if (result.settled?.refused) {
    notes.push(
      `${result.settled.refused.toLocaleString('en-IN')} looked settled and were left alone — check the file covers everything`
    )
  }

  // Said in the file's terms, because "settled" on its own invites the
  // question this answers: paid off, or simply no longer in the export.
  if (result.settled?.gone) {
    notes.push(`${result.settled.gone.toLocaleString('en-IN')} no longer in the file`)
  }

  // Said first, and in its own words: rows left out by a window the person set
  // themselves are not a problem with the file, and must never read like one.
  if (result.filteredOut) {
    notes.push(`${result.filteredOut.toLocaleString('en-IN')} outside your date filter`)
  }

  if (result.withoutCoordinator) {
    notes.push(
      `${result.withoutCoordinator.toLocaleString('en-IN')} imported under coordinator names not in the CRM`
    )
  }

  const why = result.skippedBecause
  if (!why) {
    if (result.skipped) notes.push(`${result.skipped} skipped`)
    return `${BOOK_LABEL[book]}: ${rows}${notes.length ? ` · ${notes.join(' · ')}` : ''}`
  }

  // Said plainly, because it is the reassuring half of the number.
  if (why.settled) notes.push(`${why.settled.toLocaleString('en-IN')} already paid`)
  if (why.needsCoordinator) {
    notes.push(`${why.needsCoordinator.toLocaleString('en-IN')} waiting on a coordinator name`)
  }
  if (why.malformed) notes.push(`${why.malformed.toLocaleString('en-IN')} could not be read`)

  return `${BOOK_LABEL[book]}: ${rows}${notes.length ? ` · ${notes.join(' · ')}` : ''}`
}
