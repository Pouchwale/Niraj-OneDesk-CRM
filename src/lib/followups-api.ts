import { isSetAside } from './no-followup'
import type { Followup, FollowupMode, FollowupStatus, FollowupEntityType } from './types'
import { demoCompanyStore } from './demo-companies'
import { todayISO, parseISODate } from './utils'
import { deriveCompanyStatus } from './companies-upload'
import { getCompanyById, updateCompany } from './companies-api'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { DAY_MS } from '@/lib/constants'
import { normalizeBpCode } from './bp-code'

export interface FollowupStats {
  totalFollowups: number
  dueToday: number
  overdueCommitments: number
  lastFollowupDate: string | null
}

/** Column that stores the entity id for a given follow-up kind. */
function entityColumn(entityType: FollowupEntityType): 'company_id' | 'overdue_payment_id' {
  return entityType === 'company' ? 'company_id' : 'overdue_payment_id'
}

/** Maps a DB row onto the polymorphic shape the app uses. */
function fromRow(row: any): Followup {
  const entity_type: FollowupEntityType = row.entity_type ?? 'company'
  return {
    ...row,
    entity_type,
    entity_id: entity_type === 'company' ? row.company_id : row.overdue_payment_id,
  } as Followup
}

/** Maps the app shape back onto the DB columns. */
function toRow(followup: Partial<Followup>): Record<string, unknown> {
  const { entity_id, entity_type, ...rest } = followup
  const row: Record<string, unknown> = { ...rest }

  if (entity_type) {
    row.entity_type = entity_type
    if (entity_id !== undefined) row[entityColumn(entity_type)] = entity_id
  }
  return row
}

export async function getFollowupsForEntity(
  entityId: string,
  entityType: FollowupEntityType = 'company'
): Promise<Followup[]> {
  return demoCompanyStore.getFollowupsForEntity(entityId, entityType)

}

/** @deprecated Use getFollowupsForEntity. Kept for the company timeline call sites. */
export async function getFollowupsForCompany(companyId: string): Promise<Followup[]> {
  return getFollowupsForEntity(companyId, 'company')
}

/** Every follow-up on record, for the screens that read the whole team. */
export async function getAllFollowups(): Promise<Followup[]> {
  return demoCompanyStore.getAllFollowups()

}

/**
 * Keeps the parent company's status in step with the latest follow-up.
 *
 * A coordinator marking a follow-up "paid" is what settles the account; any
 * other outcome leaves the status driven by the due date, so it is recomputed
 * rather than left stale.
 */
export async function syncCompanyStatusFromFollowup(
  companyId: string,
  followupStatus: FollowupStatus
): Promise<void> {
  try {
    // Only company invoices carry a due-date derived status.

    const company = await getCompanyById(companyId)
    if (!company) return

    const nextStatus =
      followupStatus === 'paid'
        ? 'paid'
        : deriveCompanyStatus(company.due_date, company.total_amount)

    if (nextStatus !== company.status) {
      await updateCompany(companyId, { status: nextStatus })
    }
  } catch (err) {
    // A status refresh must never fail the follow-up the coordinator just logged.
    console.error('Failed to sync company status:', err)
  }
}

export async function addFollowup(data: Omit<Followup, 'id' | 'created_at' | 'edited_at'>): Promise<Followup | undefined> {
  const now = new Date().toISOString()
  
  const id = `fu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const followup: Followup = {
    ...data,
    id,
    created_at: now,
    edited_at: null
  }

  const addedFollowup = demoCompanyStore.addFollowup(followup)

  if (data.entity_type === 'company') {
    demoCompanyStore.updateCompany(data.entity_id, {})
    await syncCompanyStatusFromFollowup(data.entity_id, data.status)
  } else {
    demoCompanyStore.touchOverduePayment(data.entity_id, data.status)
  }
  return addedFollowup

}

export async function editFollowup(
  id: string,
  updates: Partial<Followup>,
  actorId?: string
): Promise<Followup | undefined> {
  const now = new Date()

  // An edit never changes who logged the follow-up. A team leader correcting a
  // coordinator's note would otherwise reattribute the call to herself, which
  // silently rewrites the history the coordinator is measured on.
  const { coordinator_id: _ignored, ...safeUpdates } = updates

  const existing = demoCompanyStore.getAllFollowups().find(f => f.id === id)
  if (!existing) throw new Error('Followup not found')

  const createdAt = new Date(existing.created_at)
  const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

  if (hoursDiff > 24) {
    throw new Error('Edit window (24 hours) has expired')
  }

  const updated = {
    ...existing,
    ...safeUpdates,
    edited_at: now.toISOString()
  }

  // Keep the version being replaced: an edited commitment note is exactly
  // what someone disputes later.
  demoCompanyStore.addAuditEntry({
    id: `audit-followup-${id}-${now.getTime()}`,
    entity_type: 'followup',
    entity_id: id,
    action: 'edit',
    actor_id: actorId ?? existing.coordinator_id,
    before: { ...existing } as Record<string, unknown>,
    after: { ...updated } as Record<string, unknown>,
    created_at: now.toISOString(),
  })

  const result = demoCompanyStore.editFollowup(id, updated)
  // The same status sync as logging: correcting "paid" to "no response"
  // must reopen the account, and the reverse must settle it.
  if (updated.entity_type === 'company') {
    await syncCompanyStatusFromFollowup(updated.entity_id, updated.status)
  } else {
    demoCompanyStore.touchOverduePayment(updated.entity_id, updated.status)
  }
  return result

}

export async function getOverdueCommitments(coordinatorId?: string): Promise<Followup[]> {
  const today = todayISO()
  
  // One rule, kept on the store, so the bell and the Overview agree.
  return demoCompanyStore.getOverdueCommitments(coordinatorId)

}

export interface OverdueCommitment extends Followup {
  /** Company or customer the commitment was made for. */
  entity_name: string
  coordinator_name: string
  /** Whole days since the promised payment date passed. */
  days_overdue: number
}

/**
 * Broken commitments enriched for display: entity name, who owns it, and how
 * long it has been outstanding.
 */
export async function getOverdueCommitmentDetails(
  coordinatorId?: string
): Promise<OverdueCommitment[]> {
  const commitments = await getOverdueCommitments(coordinatorId)
  const today = parseISODate(todayISO()).getTime()

  const names = await resolveEntityNames(commitments)

  return commitments
    .map((followup) => ({
      ...followup,
      entity_name: names.get(`${followup.entity_type}:${followup.entity_id}`) ?? 'Unknown',
      coordinator_name: getCoordinatorDisplayName(followup.coordinator_id),
      days_overdue: followup.committed_date
        ? Math.max(0, Math.round((today - parseISODate(followup.committed_date).getTime()) / DAY_MS))
        : 0,
    }))
    .sort((a, b) => b.days_overdue - a.days_overdue)
}

/** Looks up display names for a mixed set of company and overdue follow-ups. */
async function resolveEntityNames(followups: Followup[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()

  const companyIds = followups.filter((f) => f.entity_type === 'company').map((f) => f.entity_id)
  const overdueIds = followups.filter((f) => f.entity_type === 'overdue_payment').map((f) => f.entity_id)

  for (const id of companyIds) {
    names.set(`company:${id}`, demoCompanyStore.getCompanyById(id)?.name ?? 'Unknown company')
  }
  for (const id of overdueIds) {
    const payment = demoCompanyStore.getOverduePaymentById(id)
    names.set(`overdue_payment:${id}`, payment?.customer_name || payment?.bp_code || 'Unknown customer')
  }
  return names

}

export interface CompanyFollowupSummary {
  /** ISO timestamp of the most recent follow-up logged against the company. */
  lastFollowupDate: string | null
  /** Soonest unfulfilled payment commitment the customer has made. */
  nextCommittedDate: string | null
  nextCommittedAmount: number | null
  /** Soonest reminder the coordinator scheduled for themselves. */
  nextReminderDate: string | null
  totalFollowups: number
}

function summarize(followups: Followup[]): CompanyFollowupSummary {
  const summary: CompanyFollowupSummary = {
    lastFollowupDate: null,
    nextCommittedDate: null,
    nextCommittedAmount: null,
    nextReminderDate: null,
    totalFollowups: followups.length,
  }

  for (const f of followups) {
    if (!summary.lastFollowupDate || f.followup_date > summary.lastFollowupDate) {
      summary.lastFollowupDate = f.followup_date
    }

    if (f.status !== 'paid') {
      if (f.committed_date && (!summary.nextCommittedDate || f.committed_date < summary.nextCommittedDate)) {
        summary.nextCommittedDate = f.committed_date
        summary.nextCommittedAmount = f.committed_amount
      }
      if (f.next_reminder_date && (!summary.nextReminderDate || f.next_reminder_date < summary.nextReminderDate)) {
        summary.nextReminderDate = f.next_reminder_date
      }
    }
  }

  return summary
}

/**
 * Per-company follow-up rollup, keyed by company id. Lets a list view show the
 * real last-contact and next-commitment dates without one query per row.
 */
export async function getFollowupSummaryByCompany(
  coordinatorId?: string
): Promise<Map<string, CompanyFollowupSummary>> {
  let followups: Followup[]

  followups = demoCompanyStore.getAllFollowups()
  if (coordinatorId) {
    followups = followups.filter((f) => f.coordinator_id === coordinatorId)
  }

  const byCompany = new Map<string, Followup[]>()
  for (const f of followups) {
    const list = byCompany.get(f.entity_id)
    if (list) list.push(f)
    else byCompany.set(f.entity_id, [f])
  }

  const result = new Map<string, CompanyFollowupSummary>()
  for (const [companyId, list] of byCompany) {
    result.set(companyId, summarize(list))
  }
  return result
}

export async function getFollowupStats(coordinatorId?: string): Promise<FollowupStats> {
  const today = todayISO()
  
  let followups = demoCompanyStore.getAllFollowups()
  if (coordinatorId) {
    followups = followups.filter(f => f.coordinator_id === coordinatorId)
  }
  
  // The same two rules the Active Payments cards and the bell use.
  const dueToday = demoCompanyStore.getFollowupsDue(coordinatorId).length
  const overdueCommitments = demoCompanyStore.getOverdueCommitments(coordinatorId).length
  
  let lastFollowupDate = null
  if (followups.length > 0) {
    const sorted = [...followups].sort((a: Followup, b: Followup) => new Date(b.followup_date).getTime() - new Date(a.followup_date).getTime())
    lastFollowupDate = sorted[0].followup_date
  }
  
  return {
    totalFollowups: followups.length,
    dueToday,
    overdueCommitments,
    lastFollowupDate
  }

}

/* ===================== Follow-up history ===================== */

export interface FollowupHistoryFilters {
  /** Whose follow-ups: the person who logged them, not who owns the account now. */
  coordinatorId?: string
  /** Inclusive calendar dates on the follow-up date. */
  from?: string
  to?: string
  entityType?: FollowupEntityType
  status?: FollowupStatus
  /** Matches the account name, BP code or the note text. */
  search?: string
  /**
   * Leaves out accounts set aside (no follow-up or bankrupt). The tab inside
   * Active Payments asks for this; the Overview's team history does not, since
   * the registers live beside it.
   */
  excludeSetAside?: boolean
}

/** A follow-up with enough of its account to be read on its own. */
export interface FollowupHistoryEntry extends Followup {
  entity_name: string
  entity_bp_code: string | null
  coordinator_name: string
}

/** The latest follow-up on an account, with how many led up to it. */
export interface FollowupHistoryRow extends FollowupHistoryEntry {
  /** Follow-ups this coordinator logged on this account inside the window. */
  touches: number
}

/**
 * Identifies the customer a follow-up is about, not the row it was filed on.
 *
 * A customer usually exists twice — once in Active Payments and once in the
 * ageing report — and a coordinator logs against whichever screen she is on.
 * Keying on the BP code merges those into one relationship; without a code
 * there is nothing to match on, so the record stands alone.
 */
function accountKey(entry: FollowupHistoryEntry): string {
  const bp = normalizeBpCode(entry.entity_bp_code)
  return bp ? `bp:${bp}` : `rec:${entry.entity_type}:${entry.entity_id}`
}

/**
 * One row per coordinator per account: the most recent contact.
 *
 * Read as a list of every call, the history repeats an account once per touch
 * and buries where it actually stands. Rolled up, each line answers "when did
 * we last speak to them, and what came of it", with the earlier calls counted
 * rather than listed.
 */
/**
 * Narrows the rolled-up rows, once each account is down to its latest contact.
 *
 * Applied after the roll-up, never before: filtering the raw log first would
 * let a superseded record answer the filter, so asking for "no response" could
 * resurrect last month's unanswered call on an account that has since
 * committed to pay.
 */
export function filterHistoryRows(
  rows: FollowupHistoryRow[],
  options: { status?: FollowupStatus; search?: string } = {}
): FollowupHistoryRow[] {
  const needle = options.search?.trim().toLowerCase()
  return rows
    .filter((row) => !options.status || row.status === options.status)
    .filter((row) =>
      !needle ||
      [row.entity_name, row.entity_bp_code, row.notes]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    )
}

export function collapseToLatestPerAccount(entries: FollowupHistoryEntry[]): FollowupHistoryRow[] {
  const latest = new Map<string, FollowupHistoryRow>()

  for (const entry of entries) {
    const key = `${entry.coordinator_id}::${accountKey(entry)}`
    const held = latest.get(key)

    if (!held) {
      latest.set(key, { ...entry, touches: 1 })
      continue
    }

    held.touches += 1
    // Same day is common, so fall back to when it was recorded.
    const newer =
      entry.followup_date > held.followup_date ||
      (entry.followup_date === held.followup_date && entry.created_at > held.created_at)
    if (newer) latest.set(key, { ...entry, touches: held.touches })
  }

  return [...latest.values()].sort((a, b) => b.followup_date.localeCompare(a.followup_date))
}

/** The roll-up shown above a history list. */
export interface FollowupHistorySummary {
  total: number
  accountsTouched: number
  commitmentsMade: number
  commitmentsKept: number
  amountCommitted: number
  lastFollowupDate: string | null
}

export function summariseHistory(entries: (FollowupHistoryEntry | FollowupHistoryRow)[]): FollowupHistorySummary {
  const accounts = new Set(entries.map((e) => e.entity_id))
  const withCommitment = entries.filter((e) => e.committed_date)
  return {
    // A rolled-up row stands for every call behind it, so the tile still counts
    // the work rather than the lines on screen.
    total: entries.reduce((sum, e) => sum + ((e as FollowupHistoryRow).touches ?? 1), 0),
    accountsTouched: accounts.size,
    commitmentsMade: withCommitment.length,
    // Kept means the customer paid, whoever logged it afterwards.
    commitmentsKept: withCommitment.filter((e) => e.status === 'paid').length,
    amountCommitted: withCommitment.reduce((sum, e) => sum + (e.committed_amount ?? 0), 0),
    lastFollowupDate: entries.reduce<string | null>(
      (latest, e) => (!latest || e.followup_date > latest ? e.followup_date : latest),
      null
    ),
  }
}

/**
 * Every follow-up a coordinator logged, newest first.
 *
 * Attribution is by `coordinator_id` — who actually made the call — rather than
 * by whoever owns the account today. The two only differ if an account is
 * reassigned, and history should stay with the person who did the work.
 */
export async function getFollowupHistory(
  filters: FollowupHistoryFilters = {}
): Promise<FollowupHistoryEntry[]> {
  const { coordinatorId, from, to, entityType, status, search, excludeSetAside } = filters
  const needle = search?.trim().toLowerCase()

  const decorate = (followup: Followup): FollowupHistoryEntry => {
    let entity_name = 'Unknown account'
    let entity_bp_code: string | null = null

    if (followup.entity_type === 'company') {
      const company = demoCompanyStore.getCompanyById(followup.entity_id)
      if (company) {
        entity_name = company.name
        entity_bp_code = company.sap_bp_code
      }
    } else {
      const payment = demoCompanyStore.getOverduePaymentById(followup.entity_id)
      if (payment) {
        entity_name = payment.customer_name || payment.bp_code
        entity_bp_code = payment.bp_code
      }
    }

    return {
      ...followup,
      entity_name,
      entity_bp_code,
      coordinator_name: getCoordinatorDisplayName(followup.coordinator_id),
    }
  }

  const matches = (entry: FollowupHistoryEntry): boolean => {
    if (!needle) return true
    return [entry.entity_name, entry.entity_bp_code, entry.notes]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle))
  }

  /** Whether the account this follow-up is on has been set aside. */
  const onSetAsideAccount = (followup: Followup): boolean =>
    followup.entity_type === 'company'
      ? isSetAside(demoCompanyStore.getCompanyById(followup.entity_id))
      : isSetAside(demoCompanyStore.getOverduePaymentById(followup.entity_id))

  return demoCompanyStore
    .getAllFollowups()
    .filter((f) => !excludeSetAside || !onSetAsideAccount(f))
    .filter((f) => !coordinatorId || f.coordinator_id === coordinatorId)
    .filter((f) => !entityType || f.entity_type === entityType)
    .filter((f) => !status || f.status === status)
    // followup_date is a timestamp; compare on the calendar day.
    .filter((f) => !from || f.followup_date.slice(0, 10) >= from)
    .filter((f) => !to || f.followup_date.slice(0, 10) <= to)
    .map(decorate)
    .filter(matches)
    .sort((a, b) => b.followup_date.localeCompare(a.followup_date))

}

/* ===================== Promises the customer made ===================== */

/**
 * A payment a customer promised, as the dashboards and the assistant count it.
 *
 * Lived with the reconciliation desk, because the matching engine used a
 * promise as a hint about which credit was about to arrive. That desk is gone;
 * the promises are not. They are logged by coordinators on real accounts and
 * feed the "client commitment" figures on every dashboard.
 */
export interface Commitment {
  bp_code: string
  amount: number
  committed_date: string
  coordinator_id: string | null
}

/**
 * Every promise the team has logged that is still outstanding.
 *
 * Only what somebody actually recorded on an account, and only while that
 * account is still open: once the balance is paid or settled the promise is
 * moot, which is the same rule the nudges and the bell use.
 */
export async function getFollowupCommitments(): Promise<Commitment[]> {
  return demoCompanyStore
    .getAllFollowups()
    .filter((f) => f.committed_amount != null && f.status !== 'paid')
    .filter((f) => !demoCompanyStore.isEntitySettled(f.entity_type, f.entity_id))
    .flatMap((f) => {
      const company =
        f.entity_type === 'company' ? demoCompanyStore.getCompanyById(f.entity_id) : undefined
      const bpCode =
        company?.sap_bp_code ??
        (f.entity_type === 'overdue_payment'
          ? demoCompanyStore.getOverduePaymentById(f.entity_id)?.bp_code
          : undefined)
      if (!bpCode) return []
      return [
        {
          bp_code: bpCode,
          amount: f.committed_amount!,
          committed_date: f.committed_date ?? f.followup_date.split('T')[0],
          coordinator_id: f.coordinator_id,
        },
      ]
    })
}
