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
