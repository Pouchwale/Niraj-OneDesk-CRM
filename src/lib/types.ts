/**
 * The shapes the whole system agrees on.
 *
 * Split out of supabase.ts so they can be used away from a browser: the server
 * now runs the same working dataset the screens do, and that file creates a
 * Supabase client and reads `import.meta.env`, neither of which exists in
 * Node. supabase.ts re-exports everything here, so every existing import of
 * these types still works.
 */

/* ===== TypeScript Types matching DB schema ===== */

export type UserRole = 'coordinator' | 'team_leader' | 'admin'

/** The two businesses coordinators are split across. */
export type TeamModule = 'GP3' | 'Pouchwale'

/** The Pouchwale desks, each with its own daily-entry form. */
export type DeskId = 'artworks' | 'orders' | 'updates' | 'dispatch'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  /** Which team the member belongs to; null for the leader and the admin. */
  module: TeamModule | null
  /** Which Pouchwale desk a coordinator sits at; absent for everyone else. */
  desk?: DeskId | null
  relation_manager_name: string | null
  created_at: string
  updated_at: string
}

export interface DailyEntry {
  id: string
  entry_date: string
  employee_id: string
  is_leave: boolean

  /*
   * Order-desk throughput, recorded by the GP3 team only. Optional so entries
   * filed before these columns existed still parse.
   */
  business_partners?: number
  item_masters?: number
  sales_orders?: number
  dispatches?: number
  /** Mistakes in the order-processing work above. */
  order_errors?: number

  digital_quotations?: number
  digital_quotations_converted?: number

  /* Konica Digital, tracked separately from the rest of the order desk. */
  konica_item_masters?: number
  konica_sales_orders?: number
  konica_value?: number
  konica_errors?: number

  /** Mistakes across the day's work as a whole. */
  errors?: number

  /*
   * Pouchwale desks. Each coordinator there runs a different desk and records a
   * different set of numbers, so these are optional and only ever filled by the
   * person whose desk they belong to.
   */
  calls_made?: number
  so_po_cross_checks?: number

  payment_confirmations?: number
  production_orders?: number
  orders_without_payment_confirmation?: number

  production_planning?: number
  address_confirmations?: number
  service_emails?: number

  rfd_followup_emails?: number
  rfd_followup_calls?: number
  complaints_received?: number
  complaints_resolved?: number

  payment_calls_advance: number
  payment_email_advance: number
  overdue_calls: number
  overdue_emails: number
  fresh_leads: number
  mode_of_leads: 'Call' | 'Email' | 'WhatsApp' | 'Referral' | 'Walk-in' | 'Other' | null
  leads_connected: number
  expected_business: number
  quotations_given: number
  quotations_followed: number
  orders_received: number
  sales_amount: number
  payment_collected: number
  customer_visits: number
  cross_selling: number
  cross_selling_value: number
  extraordinary_work: string | null
  pending_work: number
  overall_status: 'green' | 'red' | 'leave'
  created_at: string
  updated_at: string
  // Joined fields
  profiles?: Profile
}

export interface PoDelivery {
  id: string
  po_no: string | null
  so_no: string | null
  so_date: string | null
  po_due_date: string | null
  po_closed_date: string | null
  delay_day: number | null
  day_committed: string | null
  customer_name: string | null
  open_order_qty: number | null
  otif_score: 'YES' | 'NO' | null
  relation_manager: string | null
  remarks: string | null
  category: 'FG - Label' | 'FG - Sleeves' | 'FG - Laminates'
  delay_bucket: string | null
  imported_at: string
  created_at: string
  updated_at: string
}

export interface CategoryKpiSnapshot {
  id: string
  category: 'FG - Label' | 'FG - Sleeves' | 'FG - Laminates'
  otif_pct: number | null
  imported_at: string
  created_at: string
}

export interface AdminSetting {
  key: string
  value: unknown
  description: string | null
  updated_at: string
}

export interface OverduePayment {
  id: string
  bp_code: string
  customer_name: string | null
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
  coordinator_name: string | null
  sales_person_name: string | null
  department: string | null
  account_type: string | null
  followup_details: string | null
  followup_timeline: string | null
  assigned_coordinator_id: string | null
  status: OverdueStatus
  /** When the company was declared bankrupt, and by whom. */
  bankrupt_declared_at?: string | null
  bankrupt_declared_by?: string | null
  /** Why — the insolvency reference, the notice, whatever was decided on. */
  bankrupt_note?: string | null
  /** Set aside: not chased, and not counted in what is owed. */
  no_followup_at?: string | null
  no_followup_by?: string | null
  no_followup_note?: string | null
  /** 'dispute' when set aside because the customer disputes the amount. */
  no_followup_kind?: 'dispute' | 'export' | null
  /** For a dispute: the balance disputed. Money above it goes on a second row (since 5 Nov 2026). */
  no_followup_amount?: number | null
  /** Set on that second row: the id of the row in dispute it carries the extra for. */
  dispute_extra_of?: string | null
  extra_fields: Record<string, unknown>
  imported_at: string
  created_at: string
  updated_at: string
}

// ===== New CRM Payment Follow-Up Types =====

export type CompanyStatus = 'current' | 'upcoming' | 'overdue' | 'critical' | 'paid'
export type FollowupMode = 'call' | 'whatsapp' | 'email' | 'in_person' | 'other'
export type FollowupStatus = 'pending' | 'committed' | 'paid' | 'escalated' | 'no_response'

/** Follow-ups are chased against either a company invoice or an overdue balance. */
export type FollowupEntityType = 'company' | 'overdue_payment'
/**
 * Where a balance stands.
 *
 * 'settled' is money that came in. 'bankrupt' is a company that has gone under:
 * the debt is still owed and still counted, but there is nobody left to chase,
 * so it leaves the working list rather than sitting in it forever.
 */
export type OverdueStatus = 'overdue' | 'critical' | 'in_progress' | 'settled' | 'bankrupt'

export interface Company {
  id: string
  sap_bp_code: string | null
  /**
   * The invoice this row is. Active Payments holds one record per invoice, so
   * this is what separates a customer's rows from each other; absent for a file
   * that carries one row per customer instead.
   */
  invoice_no?: string | null
  name: string
  contact_person: string | null
  contact_number: string
  email: string | null
  payment_terms: string
  total_amount: number
  invoice_date: string | null
  due_date: string | null
  status: CompanyStatus
  /** Set aside: not chased, and not counted in what is owed. */
  no_followup_at?: string | null
  no_followup_by?: string | null
  no_followup_note?: string | null
  /** 'dispute' when set aside because the customer disputes the amount. */
  no_followup_kind?: 'dispute' | 'export' | null
  /**
   * Declared bankrupt. Stamped on every invoice of a customer whose ageing row
   * was declared bankrupt, so Active Payments holds them out too.
   */
  bankrupt_declared_at?: string | null
  bankrupt_declared_by?: string | null
  bankrupt_note?: string | null
  assigned_coordinator_id: string | null
  /**
   * The coordinator exactly as the Excel file spelled it. What names the row
   * when that person has no login here and the row is booked to nobody.
   */
  coordinator_name?: string | null
  module: string | null
  remarks: string | null
  extra_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Followup {
  id: string
  entity_type: FollowupEntityType
  /** Id of the company or overdue payment this follow-up belongs to. */
  entity_id: string
  coordinator_id: string
  followup_date: string
  mode: FollowupMode
  notes: string | null
  customer_response: string | null
  committed_date: string | null
  committed_amount: number | null
  status: FollowupStatus
  proof_attachment_url: string | null
  next_reminder_date: string | null
  created_at: string
  edited_at: string | null
}

/**
 * A message one person sends another through Robi ("tell the team ...").
 * Stored on the server with everything else, so it reaches the recipient's own
 * computer - it used to sit in the sender's browser and reach nobody.
 */
export interface DirectedReminder {
  id: string
  /** Groups the copies of one message sent to several people at once. */
  batchId?: string
  fromUserId: string
  /** Captured at send time so the message still reads correctly after a rename. */
  fromName: string
  toCoordinatorId: string
  /** The customer or topic it concerns, when one was named. */
  subject: string | null
  message: string
  /** Where the recipient lands when they open it, when it is about a record. */
  link?: string | null
  /** How the sender addressed them: "the team", "the GP3 team", or a name. */
  audience?: string | null
  createdAt: string
}

/**
 * Robi asking a coordinator to prove a task: a screenshot of the call, email or
 * meeting, within ten minutes of logging it. Reviewed by the team leader or
 * the administrator.
 */
export interface ProofRequest {
  /** `proof:<date>:<taskId>` - one request per task per day. */
  id: string
  coordinatorId: string
  date: string
  taskId: string
  entityType: FollowupEntityType
  entityId: string
  entityName: string
  /** The follow-up that completed the task. */
  followupId: string | null
  requestedAt: string
  /** requestedAt + 10 minutes. */
  dueAt: string
  status: 'pending' | 'submitted' | 'missed' | 'approved' | 'rejected'
  fileUrl?: string | null
  submittedAt?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  reviewNote?: string | null
}

/**
 * A coordinator asking for a customer to be set aside - no follow-up, dispute
 * or bankrupt. Nothing changes until the team leader or the administrator
 * approves it; approving applies it in the coordinator's name, with their reason.
 */
export interface DecisionRequest {
  id: string
  kind: 'no_followup' | 'dispute' | 'export' | 'bankrupt'
  entityType: FollowupEntityType
  entityId: string
  bpCode: string | null
  name: string
  amount: number
  reason: string
  requestedBy: string
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string | null
  reviewedAt?: string | null
  reviewNote?: string | null
}

/** A coordinator out of the office for a day, marked by the team leader or the administrator. */
export interface AttendanceEntry {
  userId: string
  /** Local calendar date. */
  date: string
  status: 'leave' | 'half_day'
  by: string
  at: string
  /** Not a real absence: the whole day is a Robi day off (see RobiOffDay). Shown as N/A, not Leave. */
  robiOff?: boolean
}

/**
 * A day the administrator switched Robi's tasks off for everyone (since
 * 6 Nov 2026): no plan, no proof checks, and the day is N/A in the scores.
 */
export interface RobiOffDay {
  /** Local calendar date, yyyy-mm-dd. */
  date: string
  by: string
  at: string
  /** Why, e.g. a festival or a stock-taking day. */
  note: string | null
}

/**
 * How Robi celebrates Indian festivals, set by the administrator (since
 * 6 Nov 2026). Everyone reads it; each person can still mute sounds or turn
 * the automatic celebration off for themselves.
 */
export interface FestivalConfig {
  /** Everything festive on or off. */
  enabled: boolean
  /** The full-screen celebration plays once on a festival day when someone opens the CRM. */
  autoCelebrate: boolean
  /** Sounds for people who have not chosen for themselves. */
  sound: boolean
  /** Robi says greetings aloud. */
  voice: boolean
  /** The Play music button. */
  music: boolean
  /** Robi greets with the festival when he is opened. */
  robiGreeting: boolean
  /** A garland under the header on festival days. */
  decorations: boolean
  intensity: 'light' | 'normal' | 'rich'
  /** How long the automatic celebration runs, in seconds (5-60). */
  durationSec: number
  /** Show the countdown this many days before a major festival (0-30). */
  countdownDays: number
  /** Per festival id: switched off, celebrated automatically or not, corrected dates, own greeting. */
  festivals: Record<string, FestivalOverride>
  /** The company's own days, such as a foundation day. */
  custom: CustomCelebration[]
  updatedBy: string | null
  updatedAt: string | null
}

export interface FestivalOverride {
  enabled?: boolean
  auto?: boolean
  /** Year -> the date the administrator set; end only for a festival that runs several days. */
  dates?: Record<string, { start: string; end?: string }>
  /** Used instead of the built-in wish in Robi's greeting and the greeting maker. */
  greeting?: string
  /** Navratri: the colour of each of the nine days. */
  colours?: string[]
}

/** A day the company celebrates that is not on the festival list. */
export interface CustomCelebration {
  id: string
  name: string
  /** yyyy-mm-dd: the day, or the first year's day when it repeats. */
  date: string
  /** Every year on the same date. */
  yearly: boolean
  /** One of the festival looks (diwali, holi, celebration...). */
  theme: string
  emoji: string
  greeting: string
  about: string
  enabled: boolean
  /** Plays the full-screen celebration by itself. */
  auto: boolean
}

/**
 * A line of finished goods ready for dispatch (the RFD sheet from SAP), with
 * money still to come before it can go. The sheet names only the customer; the
 * coordinator, BP code and the record follow-ups are logged against come from
 * the customer's Active or Overdue Payments record, matched by name.
 */
export interface RfdRow {
  id: string
  customer_name: string
  production_order: string | null
  po_status: string | null
  sales_order: string | null
  item_code: string | null
  item_name: string | null
  item_group: string | null
  planned_qty: number | null
  rfd_qty: number | null
  uom: string | null
  so_rate: number | null
  rfd_value: number
  paid_1: number
  paid_2: number
  pending_value: number
  warehouse: string | null
  batches: number | null
  /** yyyy-mm-dd */
  ready_since: string | null
  days: number | null
  bp_code: string | null
  assigned_coordinator_id: string | null
  coordinator_name: string | null
  /** The customer's record in the CRM, where follow-ups for this row are logged. */
  anchor_type: FollowupEntityType | null
  anchor_id: string | null
  imported_at: string
}

/** Open: waiting on the customer. Closed: the order came (won). Lost: it did not. */
export type QuotationStatus = 'open' | 'closed' | 'lost'

export interface QuotationFollowup {
  at: string
  by: string
  note: string
}

/**
 * A quotation sent to a customer (since 13 Oct 2026; it used to live in the
 * Quotation List workbook). Each coordinator keeps their own; the team leader
 * and the administrator see everyone's.
 */
export interface Quotation {
  id: string
  /** The day the enquiry came in (yyyy-mm-dd). */
  inquiry_date: string | null
  coordinator_id: string | null
  /** The name as the old sheet had it, for rows it could not match. */
  coordinator_name: string | null
  customer_name: string
  concern_person: string | null
  contact_number: string | null
  /** Label, Sleeve, or Label / Sleeve. */
  source: string | null
  quotation_date: string | null
  sales_employee: string | null
  quotation_no: string | null
  /** Follow-ups logged in the CRM, newest last. */
  followups: QuotationFollowup[]
  /** Follow-ups counted in the old sheet before the CRM took over. */
  earlier_followups: number
  closing_date: string | null
  status: QuotationStatus
  customer_type: 'new' | 'existing' | null
  amount: number | null
  lost_remark: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

/**
 * One row of the billing issue log (kept in the CRM since 5 Nov 2026; it was a
 * shared sheet). A responsible person is a user id when the name is someone in
 * the CRM, otherwise the text as written ("Billing", "Production side").
 */
export interface BillingIssue {
  id: string
  /** Sr. No, given by the store when the issue is first saved. */
  sr_no: number
  /** The sheet's "Date": the day it was logged. The score period reads this. */
  date: string
  responsible_1: string | null
  responsible_2: string | null
  responsible_3: string | null
  customer_name: string
  issue: string
  issue_date: string | null
  solution: string | null
  solution_date: string | null
  invoice_no: string | null
  cn_no: string | null
  dn_no: string | null
  account_remarks: string | null
  coordinator_remarks: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

export type SelfLeadStatus = 'open' | 'closed' | 'lost'

/** A remark on a self lead, oldest first. */
export interface SelfLeadRemark {
  at: string
  by: string
  note: string
}

/**
 * A lead a coordinator found themselves (since 5 Nov 2026). One record per
 * lead; every count and value in the reports is worked out from these.
 */
export interface SelfLead {
  id: string
  /** The day the lead was found / added; periods and weeks read this. */
  date: string
  coordinator_id: string | null
  company_name: string
  contact_person: string | null
  contact_number: string | null
  /**
   * The client who gave this lead as a reference ("Referred by", as in Zoho):
   * the name as shown, and the lead it came from when it was picked from the
   * coordinator's own leads (null for an existing customer or a typed name).
   */
  referred_by_name: string | null
  referred_by_lead_id: string | null
  /** True once the coordinator has actually spoken to the lead. */
  connected: boolean
  connected_date: string | null
  status: SelfLeadStatus
  /** Expected order value while open; the order value once closed. */
  value: number | null
  lost_reason: string | null
  remarks: SelfLeadRemark[]
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

/** How a dispatch went against the sales order's date. */
export type DispatchStatus = 'Early' | 'On Time' | 'Delay'

/**
 * One row of the service log (kept in the CRM since 5 Nov 2026; it was the
 * SERVICE sheet): a dispatch mail a coordinator sent a customer.
 */
export interface ServiceRecord {
  id: string
  /** The sheet's "Date": the score period reads this. */
  date: string
  coordinator_id: string | null
  /** The name as the old sheet had it, for rows it could not match. */
  coordinator_name: string | null
  po_no: string | null
  fg_code: string | null
  sales_order_no: string | null
  customer_name: string
  dispatch_status: DispatchStatus | null
  information_date: string | null
  original_dispatch_date: string | null
  final_dispatch_date: string | null
  remark: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

/** A coordinator's "Total Customers" for one month of the service score, typed by the team leader or administrator. */
export interface ServiceCustomerTarget {
  coordinatorId: string
  /** yyyy-mm. Missing on counts saved before months existed: those are May 2026's (targetMonth). */
  month?: string
  customers: number
  updatedAt: string
  updatedBy: string | null
}

export interface CoordinatorAlias {
  id: string
  coordinator_id: string
  alias_text: string
  created_at: string
}

export interface Upload {
  id: string
  admin_id: string
  filename: string
  uploaded_at: string
  rows_total: number
  rows_created: number
  rows_updated: number
  rows_failed: number
  error_report_url: string | null
}

export interface UploadError {
  id: string
  upload_id: string
  row_number: number
  raw_data: Record<string, unknown>
  errors: string[]
  resolved: boolean
  created_at: string
}

export interface AuditLogEntry {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}
