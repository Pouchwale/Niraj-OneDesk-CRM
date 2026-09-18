import type { Company, Followup, OverduePayment } from '@/lib/types'
import { formatCurrency, formatDate, todayISO, addDaysISO } from '@/lib/utils'
import { type AssistantAction, type AssistantTask, TASK_PRIORITY } from './types'

/**
 * The only two things a nudge offers. The robot never logs on the person's
 * behalf: it opens the record, and what happened is written on the timeline
 * there, in their own words.
 */
const OPEN_OR_LATER: AssistantAction[] = [
  { intent: 'open', label: 'Open record', tone: 'primary' },
  { intent: 'snooze', label: 'Later' },
]
import { DAY_MS } from '@/lib/constants'
import { isSetAside } from '@/lib/no-followup'
import { worthChasing } from '@/lib/status-rules'
import { DUE_SOON_DAYS as SHARED_DUE_SOON_DAYS } from '@/lib/status-rules'

export interface AssistantContext {
  companies: Company[]
  overduePayments: OverduePayment[]
  /** Follow-ups belonging to this coordinator, across both entity types. */
  followups: Followup[]
  /** Overrides "today" so the rules can be tested deterministically. */
  today?: string
}

/** Amount above which a settled payment must be evidenced. */
export const PROOF_THRESHOLD = 100000

/** Days of silence on an unsettled account before the assistant chases it. */
const STALE_AFTER_DAYS = 14

/**
 * Days of silence tolerated on a balance already past 90 days.
 *
 * Tighter than STALE_AFTER_DAYS: money in the 90+ buckets is the money most
 * likely to become a write-off, so a fortnight of quiet is too long to wait
 * before saying something.
 */
const AGEING_SILENCE_DAYS = 7

/** How far ahead the assistant warns about an upcoming due date. */
// The same "due soon" line as the status rule, the list window and the bell.
const DUE_SOON_DAYS = SHARED_DUE_SOON_DAYS

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime()
  const to = new Date(`${toISO}T00:00:00`).getTime()
  return Math.round((to - from) / DAY_MS)
}

/** The calendar date portion of a follow-up timestamp, in local time. */
function followupDay(followup: Followup): string {
  const date = new Date(followup.followup_date)
  if (isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Builds the coordinator's nudge queue from their live data.
 *
 * Pure and synchronous: every rule reads only the context passed in, so the
 * behaviour is fully testable without a browser or a database.
 */
export function buildAssistantTasks(context: AssistantContext): AssistantTask[] {
  const today = context.today ?? todayISO()
  const yesterday = addDaysISO(today, -1)
  const soon = addDaysISO(today, DUE_SOON_DAYS)

  const tasks: AssistantTask[] = []

  const companyById = new Map(context.companies.map((c) => [c.id, c]))
  const overdueById = new Map(context.overduePayments.map((p) => [p.id, p]))

  const nameOf = (followup: Followup): string =>
    followup.entity_type === 'company'
      ? companyById.get(followup.entity_id)?.name ?? 'a company'
      : overdueById.get(followup.entity_id)?.customer_name ??
        overdueById.get(followup.entity_id)?.bp_code ??
        'a customer'

  /**
   * Whether the account a follow-up points at has been closed since. A promise
   * or reminder on it is moot, and every other surface skips these too.
   */
  const isSettled = (followup: Followup): boolean =>
    followup.entity_type === 'company'
      ? companyById.get(followup.entity_id)?.status === 'paid'
      : ['settled', 'bankrupt'].includes(overdueById.get(followup.entity_id)?.status ?? '')

  /** Most recent follow-up per entity, so "last contact" rules can look back. */
  const latestByEntity = new Map<string, Followup>()
  for (const followup of context.followups) {
    const key = `${followup.entity_type}:${followup.entity_id}`
    const current = latestByEntity.get(key)
    if (!current || followup.followup_date > current.followup_date) {
      latestByEntity.set(key, followup)
    }
  }

  /* ---------- 1. Recap of yesterday's work ---------- */

  const loggedYesterday = context.followups.filter((f) => followupDay(f) === yesterday)
  if (loggedYesterday.length > 0) {
    const dueToday = loggedYesterday.filter((f) => f.committed_date === today)
    const names = [...new Set(loggedYesterday.map(nameOf))]

    tasks.push({
      id: `recap:${yesterday}`,
      kind: 'yesterday_recap',
      priority: TASK_PRIORITY.yesterday_recap,
      message: `Yesterday you logged ${loggedYesterday.length} follow-up${
        loggedYesterday.length === 1 ? '' : 's'
      } — ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}.`,
      detail:
        dueToday.length > 0
          ? `${dueToday.length} of them promised payment today. I'll walk you through those next.`
          : 'Nothing from yesterday is due today. Here is what needs you instead.',
      actions: [{ intent: 'dismiss', label: 'Got it', tone: 'primary' }],
    })
  }

  /* ---------- 2. Commitments landing today ---------- */

  for (const followup of context.followups) {
    if (followup.status === 'paid' || isSettled(followup)) continue
    if (followup.committed_date !== today) continue

    const name = nameOf(followup)
    tasks.push({
      id: `commit-today:${followup.id}`,
      kind: 'commitment_due_today',
      priority: TASK_PRIORITY.commitment_due_today,
      message: `${name} promised ${
        followup.committed_amount ? formatCurrency(followup.committed_amount) : 'payment'
      } today. Did it come through?`,
      detail: followup.notes ? `Your note: "${followup.notes}"` : undefined,
      entityType: followup.entity_type,
      entityId: followup.entity_id,
      entityName: name,
      amount: followup.committed_amount,
      actions: OPEN_OR_LATER,
    })
  }

  /* ---------- 3. Commitments already broken ---------- */

  for (const followup of context.followups) {
    if (followup.status === 'paid' || isSettled(followup)) continue
    if (!followup.committed_date || followup.committed_date >= today) continue

    const name = nameOf(followup)
    const late = daysBetween(followup.committed_date, today)

    tasks.push({
      id: `commit-broken:${followup.id}`,
      kind: 'commitment_broken',
      priority: TASK_PRIORITY.commitment_broken,
      message: `${name} promised ${
        followup.committed_amount ? formatCurrency(followup.committed_amount) : 'payment'
      } by ${formatDate(followup.committed_date)} — that was ${late} day${
        late === 1 ? '' : 's'
      } ago and it is still open.`,
      detail: 'Chase it today, or escalate if they have stopped responding.',
      entityType: followup.entity_type,
      entityId: followup.entity_id,
      entityName: name,
      amount: followup.committed_amount,
      actions: OPEN_OR_LATER,
    })
  }

  /* ---------- 4. Settled payments with no evidence on file ---------- */

  for (const followup of context.followups) {
    if (followup.status !== 'paid') continue
    if (followup.proof_attachment_url) continue
    if ((followup.committed_amount ?? 0) < PROOF_THRESHOLD) continue

    const name = nameOf(followup)
    tasks.push({
      id: `proof:${followup.id}`,
      kind: 'proof_required',
      priority: TASK_PRIORITY.proof_required,
      message: `You marked ${formatCurrency(followup.committed_amount ?? 0)} from ${name} as received, but there is no proof on file.`,
      detail: 'Open the record and attach the payment screenshot, UTR receipt or bank advice to that follow-up.',
      entityType: followup.entity_type,
      entityId: followup.entity_id,
      entityName: name,
      amount: followup.committed_amount,
      followupId: followup.id,
      actions: OPEN_OR_LATER,
    })
  }

  /* ---------- 5. Reminders the coordinator set for themselves ---------- */

  for (const followup of context.followups) {
    if (followup.status === 'paid' || isSettled(followup)) continue
    if (!followup.next_reminder_date || followup.next_reminder_date > today) continue
    // A commitment rule already covers this record; don't nag twice.
    if (followup.committed_date) continue

    const name = nameOf(followup)
    tasks.push({
      id: `reminder:${followup.id}`,
      kind: 'reminder_due',
      priority: TASK_PRIORITY.reminder_due,
      message: `You scheduled a follow-up with ${name} for ${formatDate(followup.next_reminder_date)}.`,
      detail: followup.notes ? `Last time: "${followup.notes}"` : undefined,
      entityType: followup.entity_type,
      entityId: followup.entity_id,
      entityName: name,
      actions: OPEN_OR_LATER,
    })
  }

  /* ---------- 6. Overdue accounts nobody has touched ---------- */

  for (const company of context.companies) {
    if (isSetAside(company) || !worthChasing(company.total_amount)) continue
    if (company.status !== 'overdue' && company.status !== 'critical') continue
    if (latestByEntity.has(`company:${company.id}`)) continue

    tasks.push({
      id: `untouched:company:${company.id}`,
      kind: 'overdue_untouched',
      priority: TASK_PRIORITY.overdue_untouched,
      message: `${company.name} is ${company.status} for ${formatCurrency(company.total_amount)} and has never been followed up.`,
      detail: company.due_date ? `Due date was ${formatDate(company.due_date)}.` : undefined,
      entityType: 'company',
      entityId: company.id,
      entityName: company.name,
      amount: company.total_amount,
      actions: OPEN_OR_LATER,
    })
  }

  for (const payment of context.overduePayments) {
    if (payment.status === 'settled' || isSetAside(payment)) continue
    if (!worthChasing(payment.balance_due)) continue
    if (latestByEntity.has(`overdue_payment:${payment.id}`)) continue

    const name = payment.customer_name || payment.bp_code
    tasks.push({
      id: `untouched:overdue:${payment.id}`,
      kind: 'overdue_untouched',
      priority: TASK_PRIORITY.overdue_untouched,
      message: `${name} has ${formatCurrency(payment.balance_due)} outstanding with no follow-up recorded.`,
      detail:
        payment.status === 'critical'
          ? 'Ageing is past 90 days — treat this as urgent.'
          : undefined,
      entityType: 'overdue_payment',
      entityId: payment.id,
      entityName: name,
      amount: payment.balance_due,
      actions: OPEN_OR_LATER,
    })
  }

  /* ---------- 7. Payments coming due, chased before they slip ---------- */

  for (const company of context.companies) {
    if (company.status === 'paid' || isSetAside(company) || !company.due_date) continue
    if (!worthChasing(company.total_amount)) continue
    if (company.due_date < today || company.due_date > soon) continue

    const inDays = daysBetween(today, company.due_date)
    tasks.push({
      id: `due-soon:${company.id}:${company.due_date}`,
      kind: 'payment_due_soon',
      priority: TASK_PRIORITY.payment_due_soon,
      message: `${company.name} owes ${formatCurrency(company.total_amount)} ${
        inDays === 0 ? 'today' : `in ${inDays} day${inDays === 1 ? '' : 's'}`
      }.`,
      detail: 'A call before the due date is what keeps this out of the overdue list.',
      entityType: 'company',
      entityId: company.id,
      entityName: company.name,
      amount: company.total_amount,
      actions: OPEN_OR_LATER,
    })
  }

  /* ---------- 8. Old money that is still being chased too slowly ---------- */

  /**
   * Entities already nudged about ageing, so the quieter stale-contact rule
   * below does not raise a second card for the same account.
   */
  const ageingNudged = new Set<string>()

  for (const payment of context.overduePayments) {
    if (payment.status === 'settled' || isSetAside(payment)) continue
    if (!worthChasing(payment.balance_due)) continue

    const agedValue = (payment.due_91_120 ?? 0) + (payment.due_121_plus ?? 0)
    if (agedValue <= 0) continue

    const key = `overdue_payment:${payment.id}`
    const latest = latestByEntity.get(key)
    // Never-touched balances are already covered, with their own wording.
    if (!latest) continue
    if (latest.status === 'paid') continue

    const day = followupDay(latest)
    if (!day) continue

    const silentFor = daysBetween(day, today)
    if (silentFor < AGEING_SILENCE_DAYS) continue

    // A promise that has not come due yet is progress; leave it alone until it
    // is broken, which the commitment rules handle far more pointedly.
    if (latest.committed_date && latest.committed_date >= today) continue

    const name = payment.customer_name || payment.bp_code
    ageingNudged.add(key)

    tasks.push({
      id: `ageing:overdue:${payment.id}`,
      kind: 'overdue_ageing',
      priority: TASK_PRIORITY.overdue_ageing,
      message: `${formatCurrency(agedValue)} of ${name} is past 90 days and has not moved in ${silentFor} days.`,
      detail:
        (payment.due_121_plus ?? 0) > 0
          ? `${formatCurrency(payment.due_121_plus)} of it is past 120 days — escalate if the customer will not commit.`
          : 'Push for a payment date on this call.',
      entityType: 'overdue_payment',
      entityId: payment.id,
      entityName: name,
      amount: agedValue,
      actions: OPEN_OR_LATER,
    })
  }

  /* ---------- 9. Accounts that have gone quiet ---------- */

  for (const [key, followup] of latestByEntity) {
    if (followup.status === 'paid') continue
    // Already raised, more urgently, by the ageing rule above.
    if (ageingNudged.has(key)) continue

    const day = followupDay(followup)
    if (!day || daysBetween(day, today) < STALE_AFTER_DAYS) continue

    const [entityType, entityId] = key.split(':') as ['company' | 'overdue_payment', string]

    // Skip anything already settled at the record level.
    if (entityType === 'company' && companyById.get(entityId)?.status === 'paid') continue
    if (entityType === 'overdue_payment' && ['settled', 'bankrupt'].includes(overdueById.get(entityId)?.status ?? '')) continue

    const name = nameOf(followup)
    tasks.push({
      id: `stale:${key}`,
      kind: 'stale_contact',
      priority: TASK_PRIORITY.stale_contact,
      message: `It has been ${daysBetween(day, today)} days since you last spoke to ${name}.`,
      detail: 'Worth a check-in before it ages further.',
      entityType,
      entityId,
      entityName: name,
      actions: OPEN_OR_LATER,
    })
  }

  return tasks.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}
