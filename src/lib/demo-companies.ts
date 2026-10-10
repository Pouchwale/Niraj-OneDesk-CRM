import type { AttendanceEntry, Company, DecisionRequest, DirectedReminder, ProofRequest, Followup, FollowupStatus, FollowupEntityType, Upload, UploadError, AuditLogEntry, CoordinatorAlias, OverduePayment, OverdueStatus } from './types'
import { todayISO } from './utils'
import { sameBpCode } from './bp-code'
import { deriveCompanyStatus } from './status-rules'
import { CLEAR_NO_FOLLOWUP, bankruptMarkOf, isBankrupt, isNoFollowup, isSetAside, markNoFollowup } from './no-followup'
import { invoiceKeyOf } from './account-key'
// Relative: this file runs on the server too, outside Vite's alias resolution.
import { DAY_MS } from './constants'
import type { DailyPlan, PlanItemStatus } from '../features/assistant/daily-plan'

/**
 * Who a re-imported row stays with.
 *
 * The file decides, except in one case: it names somebody with no login here
 * (so it books the row to nobody) and it is the same name as last time, while
 * the row is booked to someone. Then that booking was made in the CRM - a
 * leader handing an unknown name's account to a coordinator - and tomorrow's
 * unchanged file must not take it back off them.
 */
export function keptOwner(
  existing: { assigned_coordinator_id: string | null; coordinator_name?: string | null },
  incoming: { assigned_coordinator_id: string | null; coordinator_name?: string | null }
): string | null {
  if (incoming.assigned_coordinator_id || !existing.assigned_coordinator_id) return incoming.assigned_coordinator_id
  const same = (value?: string | null) => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  const fileName = same(incoming.coordinator_name)
  return fileName && fileName === same(existing.coordinator_name) ? existing.assigned_coordinator_id : null
}

function daysAgo(n: number): string { return new Date(Date.now() - n * DAY_MS).toISOString() }
function dateAgo(n: number): string { return daysAgo(n).split('T')[0] }

/**
 * Spellings the team's sheets already use for each coordinator.
 *
 * The roster holds first names only, but exports routinely carry a surname
 * ("Devyani Vaghela") or an initial, so those forms are seeded here rather than
 * left for the matcher to guess at import time.
 */
const SEED_ALIASES: CoordinatorAlias[] = [
  { id: 'alias-1', coordinator_id: 'coord-1', alias_text: 'Pragati', created_at: daysAgo(10) },
  { id: 'alias-2', coordinator_id: 'coord-2', alias_text: 'Diya', created_at: daysAgo(10) },
  { id: 'alias-3', coordinator_id: 'coord-3', alias_text: 'Devyani', created_at: daysAgo(10) },
  { id: 'alias-4', coordinator_id: 'coord-3', alias_text: 'Devyani Vaghela', created_at: daysAgo(10) },
  { id: 'alias-5', coordinator_id: 'coord-4', alias_text: 'Foram', created_at: daysAgo(10) },
  { id: 'alias-6', coordinator_id: 'coord-5', alias_text: 'Krupa', created_at: daysAgo(10) },
  { id: 'alias-7', coordinator_id: 'coord-6', alias_text: 'Aniketa', created_at: daysAgo(10) },
  { id: 'alias-8', coordinator_id: 'coord-7', alias_text: 'Krina', created_at: daysAgo(10) },

  /*
   * The operations head owns accounts directly, and sheets spell her both ways.
   * The roster carries the single-k form, so the double-k spelling is recorded
   * here: it scores 0.84 against the profile, just under the auto-assign
   * threshold, and loosening that threshold to catch it would weaken every
   * fuzzy match in the system. Recording both spellings is the safer fix.
   */
  { id: 'alias-9', coordinator_id: 'admin-1', alias_text: 'Nikki Patel', created_at: daysAgo(10) },
  { id: 'alias-10', coordinator_id: 'admin-1', alias_text: 'Niki', created_at: daysAgo(10) },
  { id: 'alias-11', coordinator_id: 'admin-1', alias_text: 'Nikki', created_at: daysAgo(10) },

  /*
   * The same problem, and by far the most expensive one: the SAP export spells
   * her "Vishwa Vyas" where the roster holds "Vishva Vyas". One letter, and it
   * was refusing 580 rows across the two books - more than every other
   * unrecognised name put together.
   */
  { id: 'alias-12', coordinator_id: 'coord-9', alias_text: 'Vishwa Vyas', created_at: daysAgo(10) },
  { id: 'alias-13', coordinator_id: 'coord-9', alias_text: 'Vishwa', created_at: daysAgo(10) },
]

const ALIAS_STORAGE_KEY = 'crm_coordinator_aliases'

/** The alias spelling, as it is compared everywhere else. */
function aliasKey(alias: CoordinatorAlias): string {
  return (alias.alias_text ?? '').trim().toLowerCase()
}

/**
 * Coordinator aliases learned during an upload, restored across reloads.
 *
 * The rest of this store is seeded fixture data that is fine to reset, but an
 * alias records a decision the user made about who someone is. Asking again
 * after every refresh would defeat the point of learning it: the whole value of
 * mapping "Aniketa" once is never having to map it a second time.
 */
function loadLearnedAliases(): CoordinatorAlias[] {
  const merged = [...SEED_ALIASES]
  try {
    const raw = localStorage.getItem(ALIAS_STORAGE_KEY)
    if (!raw) return merged

    const stored = JSON.parse(raw)
    if (!Array.isArray(stored)) return merged

    const seen = new Set(merged.map(aliasKey))
    for (const alias of stored as CoordinatorAlias[]) {
      const key = aliasKey(alias)
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(alias)
    }
  } catch {
    // No storage (tests run in node), private browsing, or corrupt JSON - the
    // seeded aliases alone are a perfectly good starting point.
  }
  return merged
}

/** Saves only what was learned; seeded aliases come from code and may change. */
function persistLearnedAliases(aliases: CoordinatorAlias[]): void {
  try {
    const seeded = new Set(SEED_ALIASES.map(aliasKey))
    localStorage.setItem(
      ALIAS_STORAGE_KEY,
      JSON.stringify(aliases.filter((alias) => !seeded.has(aliasKey(alias))))
    )
  } catch {
    // A full quota or a blocked store must never fail the upload in progress.
  }
}

const SEED_COMPANIES: Company[] = [
  {
    id: 'comp-1',
    name: 'Balaji Print Pack',
    sap_bp_code: 'BP-1001',
    contact_person: 'Rajiv Mehra',
    contact_number: '+919876543210',
    email: 'rajiv@balajiprint.com',
    assigned_coordinator_id: 'coord-1',
    // Critical means more than 60 days past due (deriveCompanyStatus), so the
    // dates say the same thing the status does - a logged follow-up recomputes
    // the status from the due date and must not quietly demote the account.
    status: 'critical',
    payment_terms: '60 days',
    invoice_date: dateAgo(130),
    due_date: dateAgo(70),
    total_amount: 550000,
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: daysAgo(135),
    updated_at: daysAgo(70)
  },
  {
    id: 'comp-2',
    name: 'Sri Krishna Packaging',
    sap_bp_code: 'BP-1002',
    contact_person: 'Venkatesh Rao',
    contact_number: '+919876543211',
    email: 'venkatesh@skp.com',
    assigned_coordinator_id: 'coord-1',
    status: 'overdue',
    payment_terms: '30 days',
    invoice_date: dateAgo(45),
    due_date: dateAgo(15),
    total_amount: 250000,
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: daysAgo(50),
    updated_at: daysAgo(15)
  }
]

const SEED_FOLLOWUPS: Followup[] = [
  {
    id: 'fup-1',
    entity_type: 'company',
    entity_id: 'comp-1',
    coordinator_id: 'coord-1',
    mode: 'call',
    status: 'committed',
    notes: 'Spoke to Rajiv. He assured payment by next week.',
    customer_response: null,
    committed_date: dateAgo(2),
    committed_amount: 250000,
    proof_attachment_url: null,
    next_reminder_date: dateAgo(1),
    // The call that took the promise came before the promised date, not after
    // it: a follow-up logged today about a payment due two days ago would
    // read as work already done on the account.
    followup_date: daysAgo(5),
    edited_at: null,
    created_at: daysAgo(10)
  },
  {
    // Chased once, then nothing - the case the ageing nudge exists for. Gokul
    // has 5,00,000 sitting past 120 days and has not been spoken to in a
    // fortnight, which is how a balance quietly becomes a write-off.
    id: 'fup-2',
    entity_type: 'overdue_payment',
    entity_id: 'ovd-2',
    coordinator_id: 'coord-1',
    mode: 'call',
    status: 'no_response',
    notes: 'Left a message with the accounts desk. No call back.',
    customer_response: null,
    committed_date: null,
    committed_amount: null,
    proof_attachment_url: null,
    next_reminder_date: null,
    followup_date: daysAgo(14),
    edited_at: null,
    created_at: daysAgo(14)
  },

  /*
   * Collections the team has reported received. Each lands in a different
   * state on the accountant's desk: one already posted against an invoice, one
   * with the credit sitting in the queue waiting to be matched, and one where
   * the customer said they had paid but nothing has reached the bank.
   */
  {
    id: 'fup-3',
    entity_type: 'company',
    entity_id: 'comp-1',
    coordinator_id: 'coord-1',
    mode: 'call',
    status: 'paid',
    notes: 'Rajiv confirmed the transfer, net of TDS.',
    customer_response: 'Paid',
    committed_date: null,
    committed_amount: 290000,
    proof_attachment_url: 'proof/balaji-utr-0361.png',
    next_reminder_date: null,
    followup_date: daysAgo(33),
    edited_at: null,
    created_at: daysAgo(33)
  },
  {
    id: 'fup-4',
    entity_type: 'company',
    entity_id: 'comp-2',
    coordinator_id: 'coord-1',
    mode: 'whatsapp',
    status: 'paid',
    notes: 'Venkatesh sent the RTGS slip this morning.',
    customer_response: 'Paid',
    committed_date: null,
    committed_amount: 177000,
    proof_attachment_url: 'proof/skp-rtgs.jpg',
    next_reminder_date: null,
    followup_date: daysAgo(1),
    edited_at: null,
    created_at: daysAgo(1)
  },
  {
    id: 'fup-5',
    entity_type: 'overdue_payment',
    entity_id: 'ovd-1',
    coordinator_id: 'coord-2',
    mode: 'call',
    status: 'paid',
    notes: 'Accounts say it was released yesterday. No reference given.',
    customer_response: 'Paid',
    committed_date: null,
    committed_amount: 406000,
    proof_attachment_url: null,
    next_reminder_date: null,
    followup_date: daysAgo(1),
    edited_at: null,
    created_at: daysAgo(1)
  }
]


const SEED_OVERDUE: OverduePayment[] = [
  {
    id: 'ovd-1',
    bp_code: 'BP-3001',
    customer_name: 'Meridian Foods',
    balance_due: 420000,
    due_0_30: 0,
    due_31_60: 120000,
    due_61_90: 150000,
    due_91_120: 150000,
    due_121_plus: 0,
    payment_terms: '45 days',
    contact_person: 'Farhan Qureshi',
    contact_number: '+919812200110',
    email: 'accounts@meridianfoods.com',
    coordinator_name: 'Diya',
    sales_person_name: 'R. Khanna',
    department: 'Flexibles',
    account_type: 'Key Account',
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: 'coord-2',
    status: 'critical',
    extra_fields: {},
    imported_at: daysAgo(3),
    created_at: daysAgo(3),
    updated_at: daysAgo(3)
  },
  {
    id: 'ovd-2',
    bp_code: 'BP-3002',
    customer_name: 'Gokul Beverages',
    balance_due: 985000,
    due_0_30: 0,
    due_31_60: 0,
    due_61_90: 200000,
    due_91_120: 285000,
    due_121_plus: 500000,
    payment_terms: '30 days',
    contact_person: 'Lalit Gokhale',
    contact_number: '+919845600220',
    email: 'finance@gokulbev.com',
    coordinator_name: 'Pragati',
    sales_person_name: 'S. Mehta',
    department: 'Labels',
    account_type: 'Standard',
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: 'coord-1',
    status: 'critical',
    extra_fields: {},
    imported_at: daysAgo(3),
    created_at: daysAgo(3),
    updated_at: daysAgo(3)
  }
]

/** The status the ageing itself implies, used when a declaration is undone. */
function deriveOverdueStatusFor(row: OverduePayment): OverdueStatus {
  if (row.balance_due === 0) return 'settled'
  if ((row.due_91_120 || 0) > 0 || (row.due_121_plus || 0) > 0) return 'critical'
  return 'overdue'
}

const STORE_STORAGE_KEY = 'crm_demo_store'
/** Bump to discard snapshots written by an older shape of this store. */
const STORE_STORAGE_VERSION = 1

/**
 * How many refused rows are worth keeping.
 *
 * Enough to work through a bad import, small enough that a daily sync of a
 * four-thousand-row workbook cannot fill the browser's storage.
 */
export const MAX_UPLOAD_ERRORS = 500

/** Told when the browser refuses to save, so the app can say so out loud. */
const storageFailureListeners = new Set<() => void>()

export function onStorageFailure(listener: () => void): () => void {
  storageFailureListeners.add(listener)
  return () => {
    storageFailureListeners.delete(listener)
  }
}

export interface PersistedStore {
  version: number
  companies: Company[]
  followups: Followup[]
  overduePayments: OverduePayment[]
  uploads: Upload[]
  uploadErrors: UploadError[]
  auditLog: AuditLogEntry[]
  /**
   * Robi's daily plans, one per coordinator per day, kept for good: the record
   * a team leader reads to see who did what they were asked, and what slipped.
   * Optional so a file saved before plans were kept still loads.
   */
  dailyPlans?: DailyPlan[]
  /** Messages sent through Robi, one row per recipient. Optional for older files. */
  messages?: DirectedReminder[]
  /** Robi's proof checks. Optional for older files. */
  proofRequests?: ProofRequest[]
  /** Coordinators' requests to set a customer aside, awaiting approval. */
  decisionRequests?: DecisionRequest[]
  /** Coordinators on leave or a half day. Optional for older files. */
  attendance?: AttendanceEntry[]
}

/**
 * Restores the working dataset, or falls back to the seeds.
 *
 * A snapshot replaces the seeds wholesale rather than merging: once someone has
 * imported their own ageing report, the demo fixtures are not something they
 * want blended back in. That is also why an import survives at all - the admin
 * uploads, the coordinator signs in (a page load), and the rows have to still
 * be there for them.
 */
function loadPersistedStore(): PersistedStore | null {
  try {
    const raw = localStorage.getItem(STORE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedStore
    if (!parsed || parsed.version !== STORE_STORAGE_VERSION) return null
    if (!Array.isArray(parsed.companies) || !Array.isArray(parsed.overduePayments)) return null
    return parsed
  } catch {
    // No storage (tests run in node), private browsing, or corrupt JSON.
    return null
  }
}

/**
 * Each record's invoice key, worked out once.
 *
 * A sync matches every incoming row against every stored invoice, and the key
 * trims and case-folds three fields each time — on the live book about 1.1
 * million keys per sync, most of the matching cost. Records are replaced rather
 * than edited whenever a BP code, invoice number or name changes (the in-place
 * writes only ever touch the no-follow-up fields), so a key cached against the
 * record object cannot go stale: a changed record is a new object, with no
 * entry yet.
 */
const invoiceKeys = new WeakMap<Company, string>()

function invoiceKeyFor(company: Company): string {
  let key = invoiceKeys.get(company)
  if (key === undefined) {
    key = invoiceKeyOf(company.sap_bp_code, company.invoice_no, company.name)
    invoiceKeys.set(company, key)
  }
  return key
}

/**
 * What a refused row keeps of the spreadsheet line it came from.
 *
 * Nothing reads the raw row back, and keeping all of it was 293 KB of every
 * save on the live book — a quarter of each write — for the same rows refused
 * again on every sync. The fields that identify the row are enough to find it
 * in the file.
 */
const IDENTIFYING = /bp|code|customer|company|name|coordinator|invoice/i
const MAX_IDENTIFYING_FIELDS = 6

function slimUploadError(error: UploadError): UploadError {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(error.raw_data ?? {})) {
    if (!IDENTIFYING.test(key)) continue
    kept[key] = typeof value === 'string' ? value.slice(0, 80) : value
    if (Object.keys(kept).length >= MAX_IDENTIFYING_FIELDS) break
  }
  return { ...error, raw_data: kept }
}

const restored = loadPersistedStore()

class DemoCompanyStore {
  companies: Company[] = restored?.companies ?? [...SEED_COMPANIES]
  followups: Followup[] = restored?.followups ?? [...SEED_FOLLOWUPS]
  uploads: Upload[] = restored?.uploads ?? []
  // Refused rows saved by an older version still carry the whole spreadsheet
  // line; trimmed on the way in, so the very next save is small.
  uploadErrors: UploadError[] = (restored?.uploadErrors ?? []).map(slimUploadError)
  auditLog: AuditLogEntry[] = restored?.auditLog ?? []
  aliases: CoordinatorAlias[] = loadLearnedAliases()
  overduePayments: OverduePayment[] = restored?.overduePayments ?? [...SEED_OVERDUE]
  dailyPlans: DailyPlan[] = restored?.dailyPlans ?? []
  messages: DirectedReminder[] = restored?.messages ?? []
  proofRequests: ProofRequest[] = restored?.proofRequests ?? []
  decisionRequests: DecisionRequest[] = restored?.decisionRequests ?? []
  attendance: AttendanceEntry[] = restored?.attendance ?? []
  /** True once a save has been refused, so it is reported once, not every tick. */
  storageFailed = false

  constructor() {
    // Declarations made before bankruptcy covered the whole customer marked only
    // the ageing row; carry them to the invoices once, on load.
    this.carryBankruptcyToInvoices()
  }

  /**
   * Writes the working dataset back to storage.
   *
   * A failure here used to be swallowed, which meant the browser quietly
   * stopped saving and everything was gone at the next sign-in with nothing to
   * explain it. Now the refused rows — the only part that grows without limit —
   * are dropped and the save retried, and if it still will not fit, whoever is
   * watching is told rather than left to find out tomorrow.
   */
  persist(): void {
    /*
     * When the server holds the records, this browser's copy is a view of them
     * and saving it would only create a second, staler answer — the one that
     * would be shown for a moment on the next reload before the server replies.
     */
    if (forwardOp) return

    const snapshot = (): PersistedStore => ({
      version: STORE_STORAGE_VERSION,
      companies: this.companies,
      followups: this.followups,
      overduePayments: this.overduePayments,
      uploads: this.uploads,
      uploadErrors: this.uploadErrors,
      auditLog: this.auditLog,
    })

    try {
      localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(snapshot()))
      this.storageFailed = false
      return
    } catch {
      // Out of room. The error queue is the expendable part.
    }

    try {
      this.uploadErrors = []
      localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(snapshot()))
      this.storageFailed = false
      return
    } catch {
      // Still too big: the records themselves do not fit.
    }

    if (!this.storageFailed) {
      this.storageFailed = true
      for (const listener of storageFailureListeners) {
        try {
          listener()
        } catch {
          // Telling somebody must never be what breaks the import.
        }
      }
    }
  }

  /**
   * Retires the shipped demo records once real data arrives.
   *
   * The store ships with a couple of made-up customers so an empty app has
   * something to show. Once a real workbook is imported they are no longer a
   * demonstration, they are wrong figures mixed into somebody's receivables —
   * they were adding ₹8,00,000 to the book and appearing on the Overview.
   *
   * Only the ones the import did not touch are dropped: if the file happens to
   * carry the same BP code, the upsert has already turned that record into real
   * data and it must stay.
   */
  dropUntouchedSeeds(touched: Set<string>): number {
    const seededCompanies = new Set(SEED_COMPANIES.map((c) => c.id))
    const seededOverdue = new Set(SEED_OVERDUE.map((o) => o.id))

    const goneCompanies = this.companies.filter((c) => seededCompanies.has(c.id) && !touched.has(c.id))
    const goneOverdue = this.overduePayments.filter((o) => seededOverdue.has(o.id) && !touched.has(o.id))
    if (goneCompanies.length === 0 && goneOverdue.length === 0) return 0

    const dropped = new Set([...goneCompanies.map((c) => c.id), ...goneOverdue.map((o) => o.id)])
    this.companies = this.companies.filter((c) => !dropped.has(c.id))
    this.overduePayments = this.overduePayments.filter((o) => !dropped.has(o.id))
    // Their follow-ups go with them; a note against a customer that no longer
    // exists would sit in the timeline forever with nothing to open.
    this.followups = this.followups.filter((f) => !dropped.has(f.entity_id))
    return dropped.size
  }

  /** Clears the saved dataset and returns to the shipped fixtures. */
  resetToSeeds(): void {
    this.companies = [...SEED_COMPANIES]
    this.followups = [...SEED_FOLLOWUPS]
    this.overduePayments = [...SEED_OVERDUE]
    this.uploads = []
    this.uploadErrors = []
    this.auditLog = []
    try {
      localStorage.removeItem(STORE_STORAGE_KEY)
    } catch {
      // Nothing to clear when there is no storage.
    }
  }

  /**
   * Brings every account's status up to today before it is read.
   *
   * A status is stored, but the calendar moves: an account uploaded as
   * "upcoming" is overdue the morning after its due date, and critical two
   * months on, whether or not anyone logged a call. Re-deriving on read keeps
   * the badge, the status filter, the cards, the window, the bell and Robi
   * reading the same account the same way on the same day. Paid stays paid:
   * that was the team's decision, not the calendar's.
   */
  refreshStatuses(): void {
    let changed = false
    for (const company of this.companies) {
      if (company.status === 'paid') continue
      const next = deriveCompanyStatus(company.due_date, company.total_amount)
      if (next !== company.status) {
        company.status = next
        company.updated_at = new Date().toISOString()
        changed = true
      }
    }
    if (changed) this.persist()
  }

  getAllCompanies(): Company[] { this.refreshStatuses(); return [...this.companies] }
  getCompaniesForCoordinator(coordinatorId: string): Company[] { this.refreshStatuses(); return this.companies.filter(c => c.assigned_coordinator_id === coordinatorId) }
  getCompanyById(id: string): Company | undefined { this.refreshStatuses(); return this.companies.find(c => c.id === id) }
  getCompany(id: string): Company | undefined { return this.getCompanyById(id) }

  /**
   * The record a row belongs to, if the book already holds one.
   *
   * Matched on the invoice, not the customer. Active Payments holds a record
   * per invoice, so matching on the BP code alone would fold every one of a
   * customer's invoices back into the first - the collapse this book exists to
   * avoid, and it would happen silently on the second sync.
   *
   * A row with no invoice number still matches on the customer, because a file
   * that numbers nothing really does mean one row per customer.
   */
  findExistingCompany(
    sapBpCode: string | null,
    name: string,
    contactNumber: string,
    invoiceNo?: string | null
  ): Company | undefined {
    const wanted = invoiceKeyOf(sapBpCode, invoiceNo, name)
    // Each stored record's key is worked out once; see invoiceKeyFor.
    const byInvoice = this.companies.find(c => invoiceKeyFor(c) === wanted)
    if (byInvoice) return byInvoice

    // Nothing numbered: fall back to the customer, the way it always worked.
    if (invoiceNo) return undefined
    if (sapBpCode) {
      const byCode = this.companies.find(c => sameBpCode(c.sap_bp_code, sapBpCode))
      if (byCode) return byCode
    }
    return this.companies.find(c => c.name === name && (c.contact_number || '') === (contactNumber || ''))
  }

  upsertCompany(company: Company): Company {
    const existing = this.findExistingCompany(
      company.sap_bp_code,
      company.name,
      company.contact_number,
      company.invoice_no
    )
    if (existing) {
      const index = this.companies.indexOf(existing)
      this.companies[index] = {
        ...existing,
        ...company,
        id: existing.id,
        assigned_coordinator_id: keptOwner(existing, company),
        // Decisions the team made in the app outlive tomorrow's file.
        no_followup_at: existing.no_followup_at ?? null,
        no_followup_by: existing.no_followup_by ?? null,
        no_followup_note: existing.no_followup_note ?? null,
        no_followup_kind: existing.no_followup_kind ?? null,
        bankrupt_declared_at: existing.bankrupt_declared_at ?? null,
        bankrupt_declared_by: existing.bankrupt_declared_by ?? null,
        bankrupt_note: existing.bankrupt_note ?? null,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
      }
      return this.companies[index]
    }
    // A new invoice for a customer already declared bankrupt belongs to the
    // same insolvency: it arrives held out, like the rest of theirs — whether
    // the declaration was made on the ageing row or on one of their invoices.
    const insolvent = company.sap_bp_code
      ? this.overduePayments.find((p) => p.status === 'bankrupt' && sameBpCode(p.bp_code, company.sap_bp_code)) ??
        this.companies.find((c) => c.bankrupt_declared_at && sameBpCode(c.sap_bp_code, company.sap_bp_code))
      : undefined
    const newCompany = {
      ...company,
      ...(insolvent ? bankruptMarkOf(insolvent) : {}),
      id: company.id || `comp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    this.companies.push(newCompany)
    return newCompany
  }

  deleteCompany(id: string): void {
    this.companies = this.companies.filter(c => c.id !== id)
    this.followups = this.followups.filter(f => !(f.entity_type === 'company' && f.entity_id === id))
  }

  /** Follow-ups whose reminder has come due and that are not yet settled. */
  countFollowupsDueToday(coordinatorId?: string): number {
    return this.getFollowupsDue(coordinatorId).length
  }

  /** Reminders that have come due on accounts that are still open. */
  getFollowupsDue(coordinatorId?: string): Followup[] {
    const today = todayISO()
    return this.followups.filter(f =>
      f.next_reminder_date !== null &&
      f.next_reminder_date <= today &&
      f.status !== 'paid' &&
      (!coordinatorId || f.coordinator_id === coordinatorId) &&
      !this.isEntitySettled(f.entity_type, f.entity_id)
    )
  }

  updateCompany(id: string, updates: Partial<Company>): void {
    const idx = this.companies.findIndex(c => c.id === id)
    if (idx >= 0) {
      this.companies[idx] = { ...this.companies[idx], ...updates, updated_at: new Date().toISOString() }
    }
  }

  /**
   * Brings accounts to nil because the workbook says they are paid, or no
   * longer mentions them at all.
   *
   * The record is kept rather than deleted: follow-ups, notes and the history
   * of the chase all hang off it, and a customer who settles today may well be
   * back in next month's file. Marked paid, it leaves the lists and the totals
   * on its own, through the same rule a manually settled account uses.
   */
  /**
   * Retires a record the invoice book has replaced.
   *
   * Its follow-ups move to the invoice that stands in its place, because the
   * calls a coordinator logged are about the customer and did not stop being
   * true when the record changed shape. A decision to set the customer aside
   * moves with them for the same reason.
   */
  supersedeCompany(oldId: string, replacementIds: string[]): void {
    const old = this.companies.find((c) => c.id === oldId)
    if (!old || replacementIds.length === 0) return

    const [lead] = replacementIds
    for (const followup of this.followups) {
      if (followup.entity_type === 'company' && followup.entity_id === oldId) {
        followup.entity_id = lead
      }
    }

    // A customer somebody set aside stays set aside; the shape of the record
    // is not an argument against a decision a person made.
    if (isNoFollowup(old)) {
      const carried = {
        no_followup_at: old.no_followup_at,
        no_followup_by: old.no_followup_by,
        no_followup_note: old.no_followup_note,
      }
      for (const company of this.companies) {
        if (replacementIds.includes(company.id)) Object.assign(company, carried)
      }
    }

    // A bankrupt customer stays bankrupt across the same change of shape.
    if (isBankrupt(old)) {
      for (const company of this.companies) {
        if (replacementIds.includes(company.id)) Object.assign(company, bankruptMarkOf(old))
      }
    }

    this.companies = this.companies.filter((c) => c.id !== oldId)
  }

  /** Drops an ageing row and the follow-ups logged against it. */
  deleteOverduePayment(id: string): void {
    this.overduePayments = this.overduePayments.filter((o) => o.id !== id)
    this.followups = this.followups.filter(
      (f) => !(f.entity_type === 'overdue_payment' && f.entity_id === id)
    )
  }

  settleCompanies(ids: string[]): number {
    const wanted = new Set(ids)
    let settled = 0
    for (const company of this.companies) {
      if (!wanted.has(company.id)) continue
      company.total_amount = 0
      company.status = 'paid'
      company.updated_at = new Date().toISOString()
      settled++
    }
    return settled
  }

  /** The same, for ageing rows: a nil balance is a settled one. */
  settleOverduePayments(ids: string[]): number {
    const wanted = new Set(ids)
    let settled = 0
    for (const payment of this.overduePayments) {
      if (!wanted.has(payment.id)) continue
      payment.balance_due = 0
      payment.due_0_30 = 0
      payment.due_31_60 = 0
      payment.due_61_90 = 0
      payment.due_91_120 = 0
      payment.due_121_plus = 0
      payment.status = 'settled'
      payment.updated_at = new Date().toISOString()
      settled++
    }
    return settled
  }

  reassignCompany(companyId: string, newCoordinatorId: string, actorId: string): void {
    const company = this.companies.find(c => c.id === companyId)
    if (!company) return
    const oldCoordinatorId = company.assigned_coordinator_id
    this.updateCompany(companyId, { assigned_coordinator_id: newCoordinatorId })
    this.addAuditEntry({
      id: "audit-" + Date.now(), entity_type: 'company', entity_id: companyId, action: 'reassign', actor_id: actorId,
      before: { assigned_coordinator_id: oldCoordinatorId }, after: { assigned_coordinator_id: newCoordinatorId }, created_at: new Date().toISOString()
    })
  }

  getAllFollowups(): Followup[] { return [...this.followups] }
  getFollowupsForEntity(entityId: string, entityType: FollowupEntityType = 'company'): Followup[] {
    return this.followups
      .filter(f => f.entity_type === entityType && f.entity_id === entityId)
      .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
  }

  getFollowupsForCompany(companyId: string): Followup[] { return this.getFollowupsForEntity(companyId, 'company') }
  
  addFollowup(followup: Followup): Followup {
    /*
     * The same id twice is the same follow-up. The browser chooses the id, so a
     * coordinator pressing Save again after a save that failed — or seemed to —
     * cannot record one follow-up twice, whichever copy had already taken it.
     */
    const existing = followup.id ? this.followups.find(f => f.id === followup.id) : undefined
    if (existing) return existing

    const newFollowup = { ...followup, id: followup.id || "fup-" + Date.now(), created_at: new Date().toISOString() }
    this.followups.push(newFollowup)
    return newFollowup
  }

  editFollowup(id: string, updates: Partial<Followup>): Followup | undefined {
    const idx = this.followups.findIndex(f => f.id === id)
    if (idx >= 0) {
      this.followups[idx] = { ...this.followups[idx], ...updates }
      return this.followups[idx]
    }
    return undefined
  }

  /** Promises whose date has passed on accounts that are still open. */
  getOverdueCommitments(coordinatorId?: string): Followup[] {
    const today = todayISO()
    return this.followups.filter(f =>
      f.status !== 'paid' &&
      f.committed_date &&
      f.committed_date < today &&
      (!coordinatorId || f.coordinator_id === coordinatorId) &&
      !this.isEntitySettled(f.entity_type, f.entity_id)
    )
  }

  addUpload(upload: Upload): void { this.uploads.push(upload) }
  getUploads(): Upload[] { return [...this.uploads].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()) }
  /**
   * Records a refused row, keeping only what a person could actually work.
   *
   * A live Excel sync re-reads the whole file, so the same rows fail again on
   * every sync. Appending them forever took the saved dataset past the
   * browser's storage limit in three syncs, at which point every save failed
   * silently and the whole working set was lost at the next sign-in. The queue
   * is a to-do list, not an archive: the newest entries are the ones that
   * matter, and the count of what was skipped is reported by the sync itself.
   */
  addUploadError(error: UploadError): void {
    this.uploadErrors.push(slimUploadError({ ...error, id: error.id || "err-" + Date.now(), created_at: new Date().toISOString() }))
    if (this.uploadErrors.length > MAX_UPLOAD_ERRORS) {
      this.uploadErrors = this.uploadErrors.slice(-MAX_UPLOAD_ERRORS)
    }
  }
  getUploadErrors(uploadId: string): UploadError[] { return this.uploadErrors.filter(e => e.upload_id === uploadId) }
  getUnresolvedErrors(): UploadError[] { return this.uploadErrors.filter(e => !e.resolved) }
  resolveError(errorId: string): void {
    const idx = this.uploadErrors.findIndex(e => e.id === errorId)
    if (idx >= 0) this.uploadErrors[idx].resolved = true
  }

  getAliases(): CoordinatorAlias[] { return [...this.aliases] }

  addAlias(alias: CoordinatorAlias): CoordinatorAlias {
    const newAlias = { ...alias, id: alias.id || "alias-" + Date.now(), created_at: new Date().toISOString() }
    this.aliases.push(newAlias)
    persistLearnedAliases(this.aliases)
    return newAlias
  }

  removeAlias(aliasId: string): void {
    this.aliases = this.aliases.filter(a => a.id !== aliasId)
    persistLearnedAliases(this.aliases)
  }
  resolveCoordinatorId(name: string): string | null {
    if (!name) return null
    const match = this.aliases.find(a => a.alias_text.trim().toLowerCase() === name.trim().toLowerCase())
    return match ? match.coordinator_id : null
  }

  addAuditEntry(entry: AuditLogEntry): void { this.auditLog.push({ ...entry, id: entry.id || "audit-" + Date.now(), created_at: new Date().toISOString() }) }
  getAuditLog(entityType?: string, entityId?: string): AuditLogEntry[] {
    let logs = this.auditLog
    if (entityType) logs = logs.filter(l => l.entity_type === entityType)
    if (entityId) logs = logs.filter(l => l.entity_id === entityId)
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }


  /* ===== Overdue payments ===== */

  getAllOverduePayments(): OverduePayment[] { return [...this.overduePayments] }

  getOverduePaymentsForCoordinator(coordinatorId: string): OverduePayment[] {
    return this.overduePayments.filter(p => p.assigned_coordinator_id === coordinatorId)
  }

  getOverduePaymentById(id: string): OverduePayment | undefined {
    return this.overduePayments.find(p => p.id === id)
  }

  upsertOverduePayment(payment: OverduePayment): { payment: OverduePayment; wasCreated: boolean } {
    const existing = this.overduePayments.find(p => sameBpCode(p.bp_code, payment.bp_code))
    if (existing) {
      const index = this.overduePayments.indexOf(existing)
      // Follow-up progress recorded in the app must survive a re-import.
      this.overduePayments[index] = {
        ...existing,
        ...payment,
        id: existing.id,
        assigned_coordinator_id: keptOwner(existing, payment),
        // The file is the truth about the money: a balance it still lists is
        // overdue, whatever an earlier sync concluded when the row went
        // missing for a day. Only a bankruptcy - a declaration somebody made
        // on purpose - outlives the file.
        status: existing.status === 'bankrupt' ? existing.status : payment.status,
        no_followup_at: existing.no_followup_at ?? null,
        no_followup_by: existing.no_followup_by ?? null,
        no_followup_note: existing.no_followup_note ?? null,
        no_followup_kind: existing.no_followup_kind ?? null,
        created_at: existing.created_at,
        updated_at: new Date().toISOString()
      }
      return { payment: this.overduePayments[index], wasCreated: false }
    }

    // A customer declared bankrupt from their invoices, before the ageing report
    // listed them, arrives here already declared.
    const insolvent = payment.bp_code
      ? this.companies.find((c) => c.bankrupt_declared_at && sameBpCode(c.sap_bp_code, payment.bp_code))
      : undefined
    const created: OverduePayment = {
      ...payment,
      ...(insolvent ? { status: 'bankrupt' as const, ...bankruptMarkOf(insolvent) } : {}),
      id: payment.id || `ovd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    this.overduePayments.push(created)
    return { payment: created, wasCreated: true }
  }

  updateOverduePayment(id: string, updates: Partial<OverduePayment>): void {
    const idx = this.overduePayments.findIndex(p => p.id === id)
    if (idx >= 0) {
      this.overduePayments[idx] = { ...this.overduePayments[idx], ...updates, updated_at: new Date().toISOString() }
    }
  }

  /**
   * Advances an overdue balance when a follow-up is logged against it.
   *
   * A bankrupt company is left where it is: somebody deliberately declared it,
   * and a stray note on the account must not quietly put it back in the queue.
   */
  touchOverduePayment(id: string, followupStatus: FollowupStatus): void {
    // Bankrupt is a decision; settled at ₹0 is the Excel file saying nothing is
    // owed. A call logged afterwards changes neither - it reopened Neilmed at ₹0.
    // (Settled by a "paid" follow-up keeps its balance, so correcting it still reopens.)
    const current = this.getOverduePaymentById(id)
    if (current?.status === 'bankrupt') return
    if (current?.status === 'settled' && !current.balance_due) return
    const status: OverdueStatus = followupStatus === 'paid' ? 'settled' : 'in_progress'
    this.updateOverduePayment(id, { status })
  }

  /** Declares bankrupt from the ageing row. Kept for callers that only have one. */
  declareBankrupt(id: string, by: string, note?: string | null): void {
    this.declareCustomerBankrupt('overdue_payment', id, by, note)
  }

  /**
   * Every record of the customer a record belongs to: its BP code in both
   * books, or the record alone when it has no code to match on.
   */
  getCustomerRecords(
    entityType: FollowupEntityType,
    entityId: string
  ): { bpCode: string | null; companies: Company[]; payments: OverduePayment[] } | null {
    const record =
      entityType === 'company'
        ? this.companies.find((c) => c.id === entityId)
        : this.overduePayments.find((p) => p.id === entityId)
    if (!record) return null

    const bpCode = ('sap_bp_code' in record ? record.sap_bp_code : record.bp_code) || null
    return {
      bpCode,
      companies: this.companies.filter(
        (c) => (entityType === 'company' && c.id === entityId) || (bpCode !== null && sameBpCode(c.sap_bp_code, bpCode))
      ),
      payments: this.overduePayments.filter(
        (p) => (entityType === 'overdue_payment' && p.id === entityId) || (bpCode !== null && sameBpCode(p.bp_code, bpCode))
      ),
    }
  }

  /**
   * Declares a customer bankrupt, from whichever book the record is in.
   *
   * Since 11 Sept 2026 this works the way no follow-up does: the customer
   * leaves every working list and every total, in both books, and is listed
   * only in the Bankrupt register. A coordinator can make the call from an
   * Active Payments invoice as well as from the ageing row — it is the customer
   * that has gone under, so the ageing row and every invoice carry the same
   * stamp either way, and a customer the ageing report does not list yet is
   * still held out. Records already declared keep who declared them and why.
   * Returns how many records it marked.
   */
  declareCustomerBankrupt(
    entityType: FollowupEntityType,
    entityId: string,
    by: string,
    note?: string | null
  ): number {
    const customer = this.getCustomerRecords(entityType, entityId)
    if (!customer) return 0

    const now = new Date().toISOString()
    const mark = { bankrupt_declared_at: now, bankrupt_declared_by: by, bankrupt_note: note?.trim() || null }
    return this.replaceCustomerRecords(
      customer,
      (payment) => (payment.status === 'bankrupt' ? null : { ...payment, status: 'bankrupt', ...mark, updated_at: now }),
      (company) => (company.bankrupt_declared_at ? null : { ...company, ...mark, updated_at: now })
    )
  }

  /**
   * Swaps a customer's records for changed copies, rather than editing them in
   * place, the way updateOverduePayment does: a record object somebody else
   * still holds (a screen, the shipped seeds) never changes underneath them.
   * A change that returns null leaves that record alone. Returns how many changed.
   */
  private replaceCustomerRecords(
    customer: { companies: Company[]; payments: OverduePayment[] },
    changePayment: (payment: OverduePayment) => OverduePayment | null,
    changeCompany: (company: Company) => Company | null
  ): number {
    let touched = 0
    const payments = new Set(customer.payments)
    const companies = new Set(customer.companies)
    this.overduePayments = this.overduePayments.map((payment) => {
      const changed = payments.has(payment) ? changePayment(payment) : null
      if (!changed) return payment
      touched++
      return changed
    })
    this.companies = this.companies.map((company) => {
      const changed = companies.has(company) ? changeCompany(company) : null
      if (!changed) return company
      touched++
      return changed
    })
    return touched
  }

  /**
   * Undoes a bankruptcy for the whole customer, in both books: the ageing row
   * goes back to what its buckets say, and the invoices lose the stamp.
   * Returns how many records came back.
   */
  reinstateCustomer(entityType: FollowupEntityType, entityId: string): number {
    const customer = this.getCustomerRecords(entityType, entityId)
    if (!customer) return 0

    const now = new Date().toISOString()
    const cleared = { bankrupt_declared_at: null, bankrupt_declared_by: null, bankrupt_note: null, updated_at: now }
    return this.replaceCustomerRecords(
      customer,
      // Back to what the ageing itself says, not to whatever it was before.
      (payment) => (payment.status === 'bankrupt' ? { ...payment, status: deriveOverdueStatusFor(payment), ...cleared } : null),
      (company) => (company.bankrupt_declared_at ? { ...company, ...cleared } : null)
    )
  }

  /**
   * Stamps the invoices of every customer already declared bankrupt.
   *
   * Declarations made before bankruptcy covered the whole customer marked only
   * the ageing row. Run once on load so an old declaration holds the invoices
   * out exactly as a new one would. Returns how many invoices it stamped.
   */
  carryBankruptcyToInvoices(): number {
    let stamped = 0
    for (const payment of this.overduePayments) {
      if (payment.status !== 'bankrupt' || !payment.bp_code) continue
      for (const company of this.companies) {
        if (company.bankrupt_declared_at || !sameBpCode(company.sap_bp_code, payment.bp_code)) continue
        Object.assign(company, bankruptMarkOf(payment))
        stamped++
      }
    }
    return stamped
  }

  /**
   * Sets a customer aside: not chased, and not counted in what is owed.
   *
   * Applied to the customer rather than to the row in front of you. Most of
   * these customers exist in both books, and marking one of the two would leave
   * the other still being chased and still adding to the total — which is
   * exactly the confusion the setting exists to remove.
   */
  setNoFollowup(bpCode: string | null, entityId: string, by: string, note?: string | null, kind?: 'dispute' | null): number {
    const fields = markNoFollowup(by, note, kind)
    let touched = 0

    for (const company of this.companies) {
      if (company.id === entityId || (bpCode && sameBpCode(company.sap_bp_code, bpCode))) {
        Object.assign(company, fields, { updated_at: new Date().toISOString() })
        touched++
      }
    }
    for (const payment of this.overduePayments) {
      if (payment.id === entityId || (bpCode && sameBpCode(payment.bp_code, bpCode))) {
        Object.assign(payment, fields, { updated_at: new Date().toISOString() })
        touched++
      }
    }
    return touched
  }

  /** Puts the customer back into the working lists and back into the totals. */
  clearNoFollowup(bpCode: string | null, entityId: string): number {
    let touched = 0

    for (const record of [...this.companies, ...this.overduePayments]) {
      const code = 'sap_bp_code' in record ? record.sap_bp_code : record.bp_code
      if (record.id === entityId || (bpCode && sameBpCode(code, bpCode))) {
        Object.assign(record, CLEAR_NO_FOLLOWUP, { updated_at: new Date().toISOString() })
        touched++
      }
    }
    return touched
  }

  /** Puts it back in the working list, for a declaration made in error. */
  reinstateOverduePayment(id: string): void {
    if (this.getOverduePaymentById(id)?.status !== 'bankrupt') return
    // The customer's invoices come back with it.
    this.reinstateCustomer('overdue_payment', id)
  }

  getOverdueStats(coordinatorId?: string) {
    const target = coordinatorId
      ? this.getOverduePaymentsForCoordinator(coordinatorId)
      : this.overduePayments

    const stats = {
      total: target.length,
      critical: 0,
      overdue: 0,
      inProgress: 0,
      settled: 0,
      bankrupt: 0,
      bankruptBalance: 0,
      noFollowup: 0,
      noFollowupAmount: 0,
      totalBalance: 0,
    }
    for (const p of target) {
      // Set aside — no follow-up or bankrupt — is out of every figure on this
      // screen and out of its count; each is listed only in its own register.
      if (isNoFollowup(p)) {
        stats.total--
        stats.noFollowup++
        stats.noFollowupAmount += p.balance_due || 0
        continue
      }
      if (isBankrupt(p)) {
        stats.total--
        stats.bankrupt++
        stats.bankruptBalance += p.balance_due || 0
        continue
      }
      if (p.status === 'overdue') stats.overdue++
      else if (p.status === 'in_progress') stats.inProgress++
      else if (p.status === 'settled') stats.settled++

      if (p.status !== 'settled') {
        stats.totalBalance += p.balance_due || 0
        // Critical is money past 90 days, and a call logged against the row
        // does not make the money younger - so it is read from the buckets,
        // the way the Overview and the dashboard read it.
        if ((p.due_91_120 || 0) > 0 || (p.due_121_plus || 0) > 0) stats.critical++
      }
    }
    return stats
  }

  getCompanyStats(coordinatorId?: string) {
    this.refreshStatuses()
    const targetCompanies = coordinatorId ? this.companies.filter(c => c.assigned_coordinator_id === coordinatorId) : this.companies
    // "total" is the working list, not the table: paid and set-aside invoices
    // are counted on their own lines and left out of it, so the card above the
    // list and the list itself can never disagree about how many there are.
    const stats = {
      total: 0,
      overdue: 0, critical: 0, upcoming: 0, current: 0, paid: 0,
      noFollowup: 0, noFollowupAmount: 0, bankrupt: 0, bankruptAmount: 0, totalOutstanding: 0,
    }
    for (const c of targetCompanies) {
      // Set aside means set aside from the money as well: that is the half of
      // it people are relying on when they mark an account.
      if (isNoFollowup(c)) {
        stats.noFollowup++
        stats.noFollowupAmount += c.total_amount || 0
        continue
      }
      // Bankrupt is held out the same way (since 11 Sept 2026).
      if (isBankrupt(c)) {
        stats.bankrupt++
        stats.bankruptAmount += c.total_amount || 0
        continue
      }
      // Collected: counted, and then out of the way.
      if (c.status === 'paid') {
        stats.paid++
        continue
      }

      stats.total++
      if (c.status === 'overdue') stats.overdue++
      else if (c.status === 'critical') stats.critical++
      else if (c.status === 'upcoming') stats.upcoming++
      else if (c.status === 'current') stats.current++
      stats.totalOutstanding += (c.total_amount || 0)
    }
    return stats
  }

  /**
   * Whether the account a follow-up points at has been closed or set aside.
   *
   * Every rule that nags about a promise or a reminder asks this first: once
   * the company is paid, the balance settled, or the customer set aside with no
   * follow-up or declared bankrupt, the promise is moot, and the bell, the
   * Overview and the assistant should all fall silent together.
   */
  isEntitySettled(entityType: FollowupEntityType, entityId: string): boolean {
    if (entityType === 'company') {
      const company = this.getCompanyById(entityId)
      return company?.status === 'paid' || isSetAside(company)
    }
    const payment = this.getOverduePaymentById(entityId)
    return payment?.status === 'settled' || isSetAside(payment)
  }

  /**
   * The whole working dataset, as it is written down.
   *
   * The server keeps this in a file and hands it to each browser, so the shape
   * here is the shape that travels between them.
   */
  getSnapshot(): PersistedStore {
    return {
      version: STORE_STORAGE_VERSION,
      companies: this.companies,
      followups: this.followups,
      overduePayments: this.overduePayments,
      uploads: this.uploads,
      uploadErrors: this.uploadErrors,
      auditLog: this.auditLog,
      dailyPlans: this.dailyPlans,
      messages: this.messages,
      proofRequests: this.proofRequests,
      decisionRequests: this.decisionRequests,
      attendance: this.attendance,
    }
  }

  /* ===== Requests to set a customer aside ===== */

  getDecisionRequests(): DecisionRequest[] {
    return [...this.decisionRequests]
  }

  addDecisionRequest(request: DecisionRequest): void {
    if (!request?.id || this.decisionRequests.some((r) => r.id === request.id)) return
    this.decisionRequests = [...this.decisionRequests, request]
  }

  /** Approve or reject a pending request; the approval itself is applied by setNoFollowup / declareCustomerBankrupt. */
  reviewDecisionRequest(id: string, status: 'approved' | 'rejected', by: string, at: string, note?: string | null): void {
    this.decisionRequests = this.decisionRequests.map((r) =>
      r.id === id && r.status === 'pending' ? { ...r, status, reviewedBy: by, reviewedAt: at, reviewNote: note ?? null } : r
    )
  }

  /* ===== Who is in the office ===== */

  getAttendance(userId: string, date: string): AttendanceEntry | null {
    return this.attendance.find((a) => a.userId === userId && a.date === date) ?? null
  }

  getAttendanceEntries(): AttendanceEntry[] {
    return [...this.attendance]
  }

  /** On leave or a half day; replaces whatever that day said before. */
  setAttendance(entry: AttendanceEntry): void {
    if (!entry?.userId || !entry.date || (entry.status !== 'leave' && entry.status !== 'half_day')) return
    this.attendance = [...this.attendance.filter((a) => !(a.userId === entry.userId && a.date === entry.date)), entry]
  }

  /** Back to a normal day in the office. */
  clearAttendance(userId: string, date: string): void {
    this.attendance = this.attendance.filter((a) => !(a.userId === userId && a.date === date))
  }

  /* ===== Robi's proof checks ===== */

  getProofRequests(): ProofRequest[] {
    return [...this.proofRequests]
  }

  /** One request per task per day: a second screen asking again is ignored. */
  addProofRequest(request: ProofRequest): void {
    if (!request?.id || this.proofRequests.some((r) => r.id === request.id)) return
    this.proofRequests = [...this.proofRequests, request]
  }

  private changeProof(id: string, from: ProofRequest['status'][], patch: Partial<ProofRequest>): void {
    this.proofRequests = this.proofRequests.map((r) => (r.id === id && from.includes(r.status) ? { ...r, ...patch } : r))
  }

  submitProof(id: string, fileUrl: string, at: string): void {
    this.changeProof(id, ['pending'], { status: 'submitted', fileUrl, submittedAt: at })
  }

  markProofMissed(id: string, at: string): void {
    // When it was found missed: the deadline itself stays what it was.
    this.changeProof(id, ['pending'], { status: 'missed', reviewedAt: null, reviewNote: `Not sent by ${at}` })
  }

  reviewProof(id: string, status: 'approved' | 'rejected', by: string, at: string, note?: string | null): void {
    this.changeProof(id, ['submitted', 'approved', 'rejected'], { status, reviewedBy: by, reviewedAt: at, reviewNote: note ?? null })
  }

  /* ===== Messages sent through Robi ===== */

  getDirectedMessages(): DirectedReminder[] {
    return [...this.messages]
  }

  /** Stores a message's copies; one already stored (same id) is not stored twice. */
  addDirectedMessages(messages: DirectedReminder[]): number {
    const known = new Set(this.messages.map((m) => m.id))
    const fresh = messages.filter((m) => m && m.id && !known.has(m.id))
    this.messages = [...this.messages, ...fresh]
    return fresh.length
  }

  /* ===== Robi's daily plans ===== */

  getDailyPlans(): DailyPlan[] {
    return [...this.dailyPlans]
  }

  getDailyPlan(userId: string, date: string): DailyPlan | null {
    return this.dailyPlans.find((p) => p.userId === userId && p.date === date) ?? null
  }

  /** The most recent plan this person had before `date`. */
  getPreviousDailyPlan(userId: string, date: string): DailyPlan | null {
    let latest: DailyPlan | null = null
    for (const plan of this.dailyPlans) {
      if (plan.userId !== userId || plan.date >= date) continue
      if (!latest || plan.date > latest.date) latest = plan
    }
    return latest
  }

  /**
   * Keeps a day's plan. The first one made for a person and a day stands:
   * the leader's screen and the coordinator's own may both try to make it, and
   * the goalposts must not move once work has started. An empty plan may be
   * replaced - there was nothing to plan when the day began, and an upload
   * since may have changed that.
   */
  recordDailyPlan(plan: DailyPlan): DailyPlan {
    const index = this.dailyPlans.findIndex((p) => p.userId === plan.userId && p.date === plan.date)
    if (index === -1) {
      this.dailyPlans.push(plan)
      return plan
    }
    if (this.dailyPlans[index].items.length > 0) return this.dailyPlans[index]
    this.dailyPlans[index] = plan
    return plan
  }

  /**
   * Adds a round of overdue accounts to a day's plan, once: the leader's
   * screen and the coordinator's may both notice the batch before it is done,
   * and the second one must not add it again.
   */
  addDailyPlanRound(userId: string, date: string, round: number, items: DailyPlan['items']): void {
    const plan = this.getDailyPlan(userId, date)
    if (!plan || items.length === 0) return
    if (plan.items.some((item) => (item.round ?? 0) >= round)) return
    const next = { ...plan, items: [...plan.items, ...items.map((item) => ({ ...item, round }))] }
    this.dailyPlans = this.dailyPlans.map((p) => (p === plan ? next : p))
  }

  /** Sets an item aside for the day ("Later"), or puts it back. */
  setDailyPlanItemSkipped(userId: string, date: string, taskId: string, skipped: boolean): void {
    const plan = this.getDailyPlan(userId, date)
    if (!plan || !plan.items.some((item) => item.taskId === taskId)) return
    const rest = plan.skipped.filter((id) => id !== taskId)
    const next = { ...plan, skipped: skipped ? [...rest, taskId] : rest }
    this.dailyPlans = this.dailyPlans.map((p) => (p === plan ? next : p))
  }

  /** Fixes how a finished day ended. Once only: the first judgement stands. */
  closeDailyPlan(userId: string, date: string, outcome: Record<string, PlanItemStatus>, closedAt: string): void {
    const plan = this.getDailyPlan(userId, date)
    if (!plan || plan.outcome) return
    const next = { ...plan, outcome, closedAt }
    this.dailyPlans = this.dailyPlans.map((p) => (p === plan ? next : p))
  }

  /**
   * Replaces everything with someone else's copy.
   *
   * Used at both ends of the wire: the server loads the file into itself at
   * boot, and a browser adopts what the server sends. Anything missing from
   * the snapshot is emptied rather than left behind, so adopting a copy really
   * does mean holding the same records and not a merge of two eras.
   */
  replaceAll(snapshot: Partial<PersistedStore>): void {
    this.companies = snapshot.companies ?? []
    this.followups = snapshot.followups ?? []
    this.overduePayments = snapshot.overduePayments ?? []
    this.uploads = snapshot.uploads ?? []
    this.uploadErrors = (snapshot.uploadErrors ?? []).map(slimUploadError)
    this.auditLog = snapshot.auditLog ?? []
    this.dailyPlans = snapshot.dailyPlans ?? []
    this.messages = snapshot.messages ?? []
    this.proofRequests = snapshot.proofRequests ?? []
    this.decisionRequests = snapshot.decisionRequests ?? []
    this.attendance = snapshot.attendance ?? []
    this.refreshStatuses()
  }
}

/**
 * Method-name prefixes that only read. Everything else is assumed to mutate and
 * triggers a save.
 *
 * Inverted deliberately: a new mutator added later persists by default, whereas
 * an allow-list of writers would silently lose data the day someone forgets to
 * add to it. A stray save on a read costs one debounced serialisation.
 */
/*
 * `is` too: isEntitySettled only answers a question, but without it here it
 * was sent to the server as a change - and refused, taking every real change
 * that happened to share its batch down with it.
 */
const READ_ONLY_PREFIXES = ['get', 'find', 'count', 'persist', 'is']

function isReadOnly(method: string): boolean {
  return READ_ONLY_PREFIXES.some((prefix) => method.startsWith(prefix))
}

/**
 * The store, wrapped so that any mutating call is written back to storage.
 *
 * Saving is coalesced to the end of the tick: importing a few hundred rows
 * calls upsert once per row, and serialising the whole dataset each time would
 * make a large import crawl.
 */
/** Anyone who wants to hear that the working dataset changed. */
const changeListeners = new Set<() => void>()

/**
 * Calls `listener` after any mutation has been written, coalesced per tick.
 *
 * This is how the robot tracks work done on other screens: a follow-up logged
 * from an account panel updates its plan and its nudges without a reload.
 */
export function subscribeToDemoStore(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

/**
 * Suspends saving while a bulk import runs.
 *
 * Coalescing per tick is not enough for an import: the loop awaits once per
 * row, so every row drains the microtask queue and serialises the entire
 * dataset again. On a four-thousand-row workbook that was fifty-six seconds of
 * writing the same megabytes over and over. Held open for the whole import, it
 * is one save at the end.
 */
let bulkDepth = 0
let bulkDirty = false

/**
 * True while an import is running.
 *
 * Whoever is sending changes to the server has to wait for this: an import
 * builds the new picture row by row and reads its own work as it goes (which
 * invoice already exists, what the file no longer mentions), so adopting the
 * server's copy halfway through would pull the ground out from under it.
 */
export function isImporting(): boolean {
  return bulkDepth > 0
}

export async function inBulk<T>(work: () => Promise<T>): Promise<T> {
  bulkDepth++
  try {
    return await work()
  } finally {
    bulkDepth--
    if (bulkDepth === 0 && bulkDirty) {
      bulkDirty = false
      demoCompanyStore.persist()
      notifyChange()
    }
  }
}

function notifyChange(): void {
  for (const listener of changeListeners) {
    try {
      listener()
    } catch (err) {
      // One bad listener must not stop the others, or the save.
      console.error('Store listener failed:', err)
    }
  }
}

/**
 * Where a change goes once it has been made.
 *
 * In the browser this is set to the server, so a change is applied here for the
 * screen to redraw and sent on to the one copy everybody shares. On the server
 * it stays unset: there is nowhere further to forward to, and forwarding there
 * would send every change straight back to itself.
 */
type OpForwarder = (method: string, args: unknown[]) => void

let forwardOp: OpForwarder | null = null

export function forwardOpsTo(forwarder: OpForwarder | null): void {
  forwardOp = forwarder
}

/** True once changes are being sent to a server rather than saved locally. */
export function isShared(): boolean {
  return forwardOp !== null
}

/**
 * Prefixes the store uses when a record arrives without an id.
 *
 * Both copies have to reach the same id, or the browser would hold a follow-up
 * under one name and the server under another, and the next edit would miss.
 * Every one of these methods honours an id it is given, so the browser chooses
 * it before the change is applied and sends that choice along with it.
 */
/**
 * Changes that are this browser's own business.
 *
 * `replaceAll` is how a browser adopts what the server just sent it. Forwarding
 * that back would be a browser telling the server what the server had told it a
 * moment earlier — refused, correctly, but it would mean a failed request on
 * every single load and a loop with the reload that follows a refusal.
 */
const NEVER_FORWARD = new Set(['replaceAll'])

const ID_PREFIXES: Record<string, string> = {
  addFollowup: 'fup',
  addAuditEntry: 'audit',
  addUploadError: 'err',
  addAlias: 'alias',
  addUpload: 'upl',
  upsertCompany: 'comp',
  upsertOverduePayment: 'ovd',
}

function withChosenId(method: string, args: unknown[]): unknown[] {
  const prefix = ID_PREFIXES[method]
  if (!prefix) return args
  const first = args[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return args
  const record = first as { id?: string }
  if (record.id) return args
  return [
    { ...record, id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ...args.slice(1),
  ]
}

function withPersistence(store: DemoCompanyStore): DemoCompanyStore {
  let queued = false

  const schedule = () => {
    // Inside a bulk import, remember that something changed and save once.
    if (bulkDepth > 0) {
      bulkDirty = true
      return
    }
    if (queued) return
    queued = true
    Promise.resolve().then(() => {
      queued = false
      store.persist()
      notifyChange()
    })
  }

  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function' || typeof prop !== 'string') return value
      if (isReadOnly(prop)) return value.bind(target)

      const local = NEVER_FORWARD.has(prop)
      return (...rawArgs: unknown[]) => {
        const args = forwardOp && !local ? withChosenId(prop, rawArgs) : rawArgs
        const result = (value as (...a: unknown[]) => unknown).apply(target, args)
        // Applied here so the screen redraws at once; sent on so everybody
        // else's screen catches up too.
        if (!local) forwardOp?.(prop, args)
        schedule()
        return result
      }
    },
  })
}

export const demoCompanyStore = withPersistence(new DemoCompanyStore())
