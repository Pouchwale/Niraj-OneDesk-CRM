/**
 * Role-specific dashboard KPIs.
 *
 * The dashboard used to show the same four numbers to everyone, which meant
 * most of them were furniture: a quotation win rate tells a coordinator nothing
 * about the credits piling up in their queue, and a team sales total tells a
 * coordinator nothing about which customer broke a promise this morning.
 *
 * Two rules shape what is in here:
 *
 *  1. Every KPI must be something the person seeing it can act on today, and
 *     each card says where to go and do it.
 *  2. Every number is derived from real data. The previous cards carried
 *     hardcoded deltas ("+12.5%") that moved for nobody and would have quietly
 *     misinformed anyone who trusted them, so a trend is shown only where two
 *     genuine periods exist to compare.
 *
 * Periods are rolling 30-day windows rather than calendar months, so the
 * figures are meaningful on any day of the month instead of collapsing to zero
 * every 1st.
 */

import {
  AlertTriangle,
  Banknote,
  FileWarning,
  HandCoins,
  Inbox,
  Landmark,
  RefreshCcw,
  ScrollText,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import type { Company, DailyEntry, OverduePayment, UserRole } from '@/lib/types'
import type { Commitment } from '@/lib/followups-api'
import { formatCurrency } from '@/lib/utils'
import { DAY_MS } from '@/lib/constants'
import { normalizeBpCode } from '@/lib/bp-code'
import { BOOK_LABEL, EXCEL_BOOKS } from '@shared/api'
import type { SyncLog } from '@/lib/sync-log'
import { isSetAside } from '@/lib/no-followup'

export type KpiTone = 'neutral' | 'good' | 'warn' | 'bad'
export type KpiColor = 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' | 'indigo'

export interface RoleKpi {
  id: string
  title: string
  /** Preformatted headline figure. */
  value: string
  /** One line of context, or what to do about the number. */
  hint: string
  icon: LucideIcon
  color: KpiColor
  tone: KpiTone
  /** Percentage change against the previous period, where one genuinely exists. */
  deltaPct?: number
  /** True when a rise in this measure is good news. */
  higherIsBetter?: boolean
  /** Page that lets the viewer act on this number. */
  href?: string
}

export interface KpiSnapshot {
  today: string
  userId: string
  role: UserRole
  /** Promises the customers made, as the coordinators logged them. */
  commitments: Commitment[]
  /** Active Payments records: what the team opens and chases. */
  companies: Company[]
  /** Balances from the uploaded ageing report, which is what most rows arrive as. */
  overduePayments: OverduePayment[]
  entries: DailyEntry[]
  /** Head count used for the team-compliance figure. */
  coordinatorCount: number
  /**
   * When each book was last read, and what the import held back.
   *
   * The administrator's view of whether the system is actually working: a book
   * nobody has synced since Tuesday looks perfectly healthy on every other
   * screen, because those screens show what was imported rather than what the
   * file says now.
   */
  syncLog?: SyncLog
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS
  )
}

/**
 * Percentage change against the previous period.
 *
 * Undefined when there is no baseline, and also when the movement rounds to
 * nothing: an arrow reading "0%" is decoration, and a green up-arrow on a flat
 * period actively misleads. The card's hint still names the prior figure, so a
 * flat period stays visible without being dressed up as a gain.
 */
function changePct(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined
  const change = Math.round(((current - previous) / previous) * 100)
  return change === 0 ? undefined : change
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/**
 * Exactly what the Active Payments module totals, for the same rows.
 *
 * Deliberately not routed through the receivables book. The book answers a
 * different question — what one customer owes across both files, counted once —
 * and a dashboard card that quietly answers that while claiming to summarise
 * Active Payments is how the two screens came to disagree by ₹42 lakh with no
 * way for anybody to tell which was right.
 */
function invoiceBook(snapshot: KpiSnapshot, coordinatorId?: string) {
  const rows = snapshot.companies.filter((company) => {
    if (company.status === 'paid' || isSetAside(company)) return false
    return !coordinatorId || company.assigned_coordinator_id === coordinatorId
  })
  const late = rows.filter((c) => c.status === 'overdue' || c.status === 'critical')
  const aged = rows.filter((c) => c.status === 'critical')
  const sum = (list: Company[]) => list.reduce((t, c) => t + (c.total_amount || 0), 0)

  return {
    count: rows.length,
    outstanding: sum(rows),
    lateCount: late.length,
    lateValue: sum(late),
    agedCount: aged.length,
    agedValue: sum(aged),
  }
}

/**
 * Exactly what the Overdue module totals, and the part of it that is not
 * already an invoice in Active Payments.
 *
 * The overlap is the whole reason the two screens looked contradictory: most
 * ageing rows are the same customers, so the books cannot simply be added.
 */
function ageingBook(snapshot: KpiSnapshot, coordinatorId?: string) {
  const claimed = new Set(
    snapshot.companies.map((c) => normalizeBpCode(c.sap_bp_code)).filter(Boolean) as string[]
  )
  const rows = snapshot.overduePayments.filter((row) => {
    /*
     * Settled and set-aside rows leave — and since 11 Sept 2026 a bankrupt row
     * is set aside too, out of every total the way no follow-up is. The
     * Overdue page's own total draws the line in exactly the same place.
     */
    if (row.status === 'settled' || isSetAside(row)) return false
    return !coordinatorId || row.assigned_coordinator_id === coordinatorId
  })
  const onlyHere = rows.filter((row) => {
    const code = normalizeBpCode(row.bp_code)
    return !code || !claimed.has(code)
  })
  const aged = (list: OverduePayment[]) =>
    list.reduce((t, o) => t + (o.due_91_120 || 0) + (o.due_121_plus || 0), 0)

  return {
    count: rows.length,
    balance: rows.reduce((t, o) => t + (o.balance_due || 0), 0),
    agedValue: aged(rows),
    agedCount: rows.filter((o) => (o.due_91_120 || 0) > 0 || (o.due_121_plus || 0) > 0).length,
    onlyHereCount: onlyHere.length,
    onlyHereValue: onlyHere.reduce((t, o) => t + (o.balance_due || 0), 0),
  }
}

/**
 * How to say, in one clause, what the ageing report holds that the invoice
 * book does not.
 *
 * The remainder is a net figure and on the live file it points the other way:
 * 199 accounts that come to a credit overall. Describing a credit as something
 * the report "adds" is how a dashboard teaches people to stop reading it.
 */
function ageingRemainder(ageing: ReturnType<typeof ageingBook>): string | null {
  if (!ageing.onlyHereCount) return null
  const rows = plural(ageing.onlyHereCount, 'account')
  if (ageing.onlyHereValue > 0) {
    return `plus ${formatCurrency(ageing.onlyHereValue, true)} on ${rows} in ageing only`
  }
  if (ageing.onlyHereValue < 0) {
    return `${rows} in ageing only, ${formatCurrency(Math.abs(ageing.onlyHereValue), true)} in credit`
  }
  return `${rows} in ageing only, nothing outstanding`
}

/* ===== Coordinator ===== */

/**
 * What clients have promised to pay, and how much of that is already late.
 *
 * The only figure on the dashboard that comes from the team's own work rather
 * than from the workbook: somebody spoke to a customer, was given an amount and
 * a date, and wrote it down. It starts at zero on a fresh book and climbs as
 * follow-ups are logged, which is the point — it is the one card the team moves
 * themselves.
 *
 * A promise whose date has arrived and that no payment answered is the part
 * worth acting on, so it is named separately rather than averaged into the
 * total.
 */
function clientCommitments(snapshot: KpiSnapshot, coordinatorId?: string) {
  const mine = snapshot.commitments.filter(
    (c) => !coordinatorId || c.coordinator_id === coordinatorId
  )
  const late = mine.filter((c) => c.committed_date <= snapshot.today)
  const sum = (list: Commitment[]) => list.reduce((total, c) => total + (c.amount || 0), 0)

  return {
    count: mine.length,
    value: sum(mine),
    lateCount: late.length,
    lateValue: sum(late),
  }
}

/* ===== Coordinator ===== */

/**
 * The four figures a coordinator works from: her Active Payments book, her
 * Overdue book, what her customers have promised her, and the part of her
 * ageing that is past ninety days.
 *
 * The two books are shown side by side rather than merged. They answer
 * different questions — one is invoices she can open and chase, the other is
 * the ageing balance the finance team reports on — and every attempt to
 * combine them into a single headline produced a number that matched neither
 * page. Each card here is the total on the screen it links to.
 */
function coordinatorKpis(snapshot: KpiSnapshot): RoleKpi[] {
  const { userId } = snapshot
  const invoices = invoiceBook(snapshot, userId)
  const ageing = ageingBook(snapshot, userId)
  const promises = clientCommitments(snapshot, userId)

  return [
    {
      id: 'my-active-payments',
      title: 'My active payments',
      value: formatCurrency(invoices.outstanding, true),
      hint: invoices.lateCount
        ? `${plural(invoices.count, 'invoice')} · ${formatCurrency(invoices.lateValue, true)} of it past due`
        : `${plural(invoices.count, 'invoice')} · none past due`,
      icon: Landmark,
      color: 'blue',
      tone: 'neutral',
      href: '/companies',
    },
    {
      id: 'my-overdue-payments',
      title: 'My overdue payments',
      value: formatCurrency(ageing.balance, true),
      hint: ageing.count
        ? `${plural(ageing.count, 'account')} on the ageing report`
        : 'No ageing balance is assigned to you',
      icon: AlertTriangle,
      color: ageing.balance > 0 ? 'amber' : 'emerald',
      tone: ageing.balance > 0 ? 'warn' : 'good',
      href: '/overdue',
    },
    {
      id: 'my-commitments',
      title: 'Client commitments',
      value: formatCurrency(promises.value, true),
      hint: promises.count
        ? promises.lateCount
          ? `${plural(promises.count, 'promise')} · ${formatCurrency(promises.lateValue, true)} past the date given`
          : `${plural(promises.count, 'promise')}, none past its date yet`
        : 'No customer of yours has committed to a date',
      icon: HandCoins,
      color: promises.lateCount ? 'rose' : promises.count ? 'violet' : 'blue',
      tone: promises.lateCount ? 'bad' : promises.count ? 'neutral' : 'neutral',
      href: '/companies',
    },
    {
      id: 'my-critical-overdue',
      title: 'Critical (90+ days)',
      value: formatCurrency(ageing.agedValue, true),
      hint: ageing.agedCount
        ? `${plural(ageing.agedCount, 'account')} · ${
            ageing.balance ? Math.round((ageing.agedValue / ageing.balance) * 100) : 0
          }% of your ageing book`
        : 'Nothing of yours is past 90 days',
      icon: FileWarning,
      color: ageing.agedValue > 0 ? 'rose' : 'emerald',
      tone: ageing.agedValue > 0 ? 'bad' : 'good',
      href: '/overdue?status=critical',
    },
  ]
}

/* ===== Admin ===== */

/**
 * The same four figures across the whole team.
 *
 * The leader's version of a coordinator's day: the size of each book, what
 * customers have committed to pay, and the money past ninety days. Nothing
 * here is a derivation of its own — each figure is the total on the page it
 * opens, so a leader and a coordinator discussing one account are reading the
 * same number.
 */
function adminKpis(snapshot: KpiSnapshot): RoleKpi[] {
  const invoices = invoiceBook(snapshot)
  const ageing = ageingBook(snapshot)
  const promises = clientCommitments(snapshot)

  return [
    {
      id: 'active-payments',
      title: 'Active payments',
      value: formatCurrency(invoices.outstanding, true),
      hint: invoices.lateCount
        ? `${plural(invoices.count, 'invoice')} · ${formatCurrency(invoices.lateValue, true)} of it past due`
        : `${plural(invoices.count, 'invoice')} · none past due`,
      icon: Landmark,
      color: 'blue',
      tone: 'neutral',
      href: '/companies',
    },
    {
      id: 'overdue-payments',
      title: 'Overdue payments',
      value: formatCurrency(ageing.balance, true),
      hint: ageing.count
        ? [
            `${plural(ageing.count, 'account')} on the ageing report`,
            ageingRemainder(ageing),
          ]
            .filter(Boolean)
            .join(' · ')
        : 'The ageing report is empty',
      icon: AlertTriangle,
      color: ageing.balance > 0 ? 'amber' : 'emerald',
      tone: ageing.balance > 0 ? 'warn' : 'good',
      href: '/overdue',
    },
    {
      id: 'team-commitments',
      title: 'Client commitments',
      value: formatCurrency(promises.value, true),
      hint: promises.count
        ? promises.lateCount
          ? `${plural(promises.count, 'promise')} · ${formatCurrency(promises.lateValue, true)} past the date given`
          : `${plural(promises.count, 'promise')}, none past its date yet`
        : 'No customer has committed to a date yet',
      icon: HandCoins,
      color: promises.lateCount ? 'rose' : promises.count ? 'violet' : 'blue',
      tone: promises.lateCount ? 'bad' : 'neutral',
      href: '/companies',
    },
    {
      id: 'critical-overdue',
      title: 'Critical (90+ days)',
      value: formatCurrency(ageing.agedValue, true),
      hint: ageing.agedCount
        ? `${plural(ageing.agedCount, 'account')} · ${
            ageing.balance ? Math.round((ageing.agedValue / ageing.balance) * 100) : 0
          }% of the ageing book`
        : 'Nothing in the ageing report is past 90 days',
      icon: FileWarning,
      color: ageing.agedValue > 0 ? 'rose' : 'emerald',
      tone: ageing.agedValue > 0 ? 'bad' : 'good',
      href: '/overdue?status=critical',
    },
  ]
}
/** The four KPIs that matter to whoever is signed in. */
export function buildRoleKpis(snapshot: KpiSnapshot): RoleKpi[] {
  switch (snapshot.role) {
    // The administrator owns the system rather than the book: whether the data
    // is current, whether anything is failing to arrive, whether every account
    // has somebody answering for it.
    case 'admin':
      return systemKpis(snapshot)
    // The leader runs the book and the people working it.
    case 'team_leader':
      return adminKpis(snapshot)
    default:
      return coordinatorKpis(snapshot)
  }
}

/* ===== Super admin ===== */

/**
 * Whether the system itself is working.
 *
 * Deliberately not the company position — the leader has that, and repeating
 * it here would leave nobody watching the things only an administrator can
 * see. Each of these is a way the CRM can be quietly wrong while every other
 * screen looks fine:
 *
 *   - a book nobody has synced still shows yesterday's figures confidently;
 *   - rows the import could not assign never arrive at all, so their money is
 *     in no total and on nobody's list;
 *   - an account with no owner is nobody's job, and will not be chased.
 */
export function systemKpis(snapshot: KpiSnapshot): RoleKpi[] {
  /*
   * Read the two books the way every other card now reads them. This used to
   * go through the receivables book and so quoted ₹15.4Cr while the leader,
   * one login away, was quoted ₹15.5Cr for the same money — a difference with
   * no cause anyone could point at, which is the worst kind.
   */
  const invoices = invoiceBook(snapshot)
  const ageing = ageingBook(snapshot)

  const log = snapshot.syncLog ?? {}
  const stamps = EXCEL_BOOKS.map((each) => log[each]?.syncedAt).filter(Boolean) as string[]
  const oldest = stamps.length === EXCEL_BOOKS.length ? stamps.slice().sort()[0] : null
  // Measured from now, not from the end of today: a book synced ten minutes
   // ago read as nine hours old because the day still had nine hours left in it.
  const hoursSince = oldest
    ? Math.max(0, Math.floor((Date.now() - new Date(oldest).getTime()) / 3_600_000))
    : null
  const neverSynced = EXCEL_BOOKS.filter((each) => !log[each]?.syncedAt)
  const failed = EXCEL_BOOKS.filter((each) => log[each] && !log[each]!.success)

  // Rows the import held back because it did not recognise the coordinator.
  // This is money the business is owed that is in none of its own figures.
  const heldBack = EXCEL_BOOKS.reduce((sum, each) => sum + (log[each]?.needsCoordinator ?? 0), 0)

  const unowned = snapshot.companies.filter(
    (company) => company.status !== 'paid' && !company.assigned_coordinator_id
  )
  const unownedValue = unowned.reduce((sum, company) => sum + (company.total_amount || 0), 0)

  return [
    {
      id: 'data-freshness',
      title: 'Data freshness',
      value: neverSynced.length
        ? 'Not synced'
        : hoursSince === null
          ? 'Unknown'
          : hoursSince < 1
            ? 'Current'
            : `${plural(hoursSince, 'hour')} old`,
      hint: failed.length
        ? `The last sync of ${failed.map((b) => BOOK_LABEL[b]).join(' and ')} failed`
        : neverSynced.length
          ? `${neverSynced.map((b) => BOOK_LABEL[b]).join(' and ')} never imported`
          : 'Both books read from the workbook',
      icon: RefreshCcw,
      color: failed.length || neverSynced.length ? 'rose' : hoursSince !== null && hoursSince >= 24 ? 'amber' : 'emerald',
      tone: failed.length || neverSynced.length ? 'bad' : hoursSince !== null && hoursSince >= 24 ? 'warn' : 'good',
      href: '/companies',
    },
    {
      id: 'not-arriving',
      title: 'Not reaching the CRM',
      value: String(heldBack),
      hint: heldBack
        ? 'Rows held back: the file names a coordinator the system does not know'
        : 'Every row in the file has a coordinator the system knows',
      icon: FileWarning,
      color: heldBack ? 'amber' : 'emerald',
      tone: heldBack ? 'warn' : 'good',
      href: '/admin/users',
    },
    {
      id: 'unowned',
      title: 'Accounts with no owner',
      value: String(unowned.length),
      hint: unowned.length
        ? `${formatCurrency(unownedValue, true)} on accounts with no coordinator`
        : 'Every open account has an owner',
      icon: Users,
      color: unowned.length ? 'rose' : 'emerald',
      tone: unowned.length ? 'bad' : 'good',
      href: '/companies',
    },
    {
      id: 'book-size',
      title: 'The book it is holding',
      value: formatCurrency(invoices.outstanding, true),
      hint: [`${plural(invoices.count, 'invoice')} imported`, ageingRemainder(ageing)]
        .filter(Boolean)
        .join(' · '),
      icon: Landmark,
      color: 'blue',
      tone: 'neutral',
      href: '/admin/overview',
    },
  ]
}

/** Heading shown above the cards, so the scope of the numbers is never ambiguous. */
export function kpiSectionTitle(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'System health'
    case 'team_leader':
      return 'Company position'
    default:
      return 'Your accounts today'
  }
}
