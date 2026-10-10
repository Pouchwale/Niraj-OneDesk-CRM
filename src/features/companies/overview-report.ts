/**
 * Overview report: everything the Overview shows, for one period, gathered
 * into sections a PDF can print (see overview-report-pdf.ts). Kept apart from
 * the drawing so the figures can be tested.
 */

import type { DailyPlan } from '@/features/assistant/daily-plan'
import { customerLookup, openAccountKeys } from '@/features/assistant/daily-plan'
import { planHistory, RESULT_LABEL, type HistoryRow } from '@/features/assistant/plan-history'
import { dailyScores, weekAverage, type DayScore } from '@/features/assistant/scores'
import { summariseHistory, type FollowupHistoryEntry } from '@/lib/followups-api'
import { isDispute, isNoFollowup } from '@/lib/no-followup'
import type { AttendanceEntry, Company, DecisionRequest, Followup, OverduePayment, ProofRequest } from '@/lib/types'

export interface ReportInput {
  from: string
  to: string
  today: string
  coordinators: { id: string; full_name: string }[]
  companies: Company[]
  overduePayments: OverduePayment[]
  followups: Followup[]
  plans: DailyPlan[]
  proofRequests: ProofRequest[]
  decisionRequests: DecisionRequest[]
  attendance: AttendanceEntry[]
  nameOf: (userId: string | null | undefined) => string
}

export interface ReportTable {
  title: string
  note?: string
  head: string[]
  rows: (string | number)[][]
  /** Columns holding amounts or counts, right-aligned. */
  numeric?: number[]
  /** Fixed widths in mm for short columns (dates, codes), so they never wrap. */
  widths?: Record<number, number>
}

export interface OverviewReport {
  from: string
  to: string
  kpis: { label: string; value: string }[]
  tables: ReportTable[]
}

/** Rupees as "Rs 1,23,456": the PDF's built-in fonts have no rupee sign. */
export const rupees = (n: number | null | undefined) => `Rs ${Math.round(n ?? 0).toLocaleString('en-IN')}`

const MODE: Record<string, string> = { call: 'Call', whatsapp: 'WhatsApp', email: 'Email', in_person: 'In person', other: 'Other' }
const KIND: Record<DecisionRequest['kind'], string> = { no_followup: 'No follow-up', dispute: 'Dispute', bankrupt: 'Bankrupt' }
const PROOF: Record<ProofRequest['status'], string> = {
  pending: 'Waiting', submitted: 'To review', missed: 'Missed', approved: 'Approved', rejected: 'Rejected',
}

const day = (iso: string | null | undefined) => String(iso ?? '').slice(0, 10)
const inPeriod = (date: string, from: string, to: string) => date >= from && date <= to
const pretty = (date: string | null | undefined) => {
  if (!date) return ''
  const d = new Date(`${day(date)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? String(date) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const clock = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}
const scoreText = (s: number | null | undefined) => (s === null || s === undefined ? '-' : s === 0 ? '0%' : `${s}%`)

export function buildOverviewReport(input: ReportInput): OverviewReport {
  const { from, to, nameOf } = input
  const coordinatorIds = new Set(input.coordinators.map((c) => c.id))
  const leave = new Map(input.attendance.map((a) => [`${a.userId}|${a.date}`, a.status]))

  /* ----- who the records belong to ----- */
  const companyById = new Map(input.companies.map((c) => [c.id, c]))
  const overdueById = new Map(input.overduePayments.map((p) => [p.id, p]))
  const account = (entityType: string, entityId: string) => {
    if (entityType === 'company') {
      const c = companyById.get(entityId)
      return { name: c?.name ?? 'Unknown account', bp: c?.sap_bp_code ?? '' }
    }
    const p = overdueById.get(entityId)
    return { name: p?.customer_name || p?.bp_code || 'Unknown account', bp: p?.bp_code ?? '' }
  }

  /* ----- follow-ups in the period ----- */
  const followups = input.followups
    .filter((f) => inPeriod(day(f.followup_date || f.created_at), from, to))
    .sort((a, b) => (a.followup_date || a.created_at).localeCompare(b.followup_date || b.created_at))
  const commitments = followups.filter((f) => f.committed_date)

  /* ----- Robi's tasks and scores ----- */
  const owed = openAccountKeys(input.companies, input.overduePayments)
  const mine = new Map(
    input.coordinators.map((c) => [
      c.id,
      openAccountKeys(
        input.companies.filter((x) => x.assigned_coordinator_id === c.id),
        input.overduePayments.filter((x) => x.assigned_coordinator_id === c.id)
      ),
    ])
  )
  const tasks: HistoryRow[] = planHistory(
    input.plans.filter((p) => coordinatorIds.has(p.userId) && inPeriod(p.date, from, to)),
    input.followups,
    input.today,
    owed,
    mine,
    customerLookup(input.companies, input.overduePayments),
    (u, d) => leave.get(`${u}|${d}`) ?? null
  ).sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.coordinatorId).localeCompare(nameOf(b.coordinatorId)))
  const scores = dailyScores(tasks)
  const scoresOf = (userId: string) => [...scores.entries()].filter(([k]) => k.startsWith(`${userId}|`)).map(([, s]) => s)

  const proofs = input.proofRequests.filter((r) => coordinatorIds.has(r.coordinatorId) && inPeriod(r.date, from, to))
  const decisions = input.decisionRequests.filter((r) => inPeriod(day(r.requestedAt), from, to))
  const attendance = input.attendance.filter((a) => coordinatorIds.has(a.userId) && inPeriod(a.date, from, to))

  /* ----- customers set aside in the period, once per customer ----- */
  const setAside = new Map<string, { at: string; kind: string; name: string; bp: string; amount: number; by: string; note: string }>()
  const markAside = (bp: string, name: string, kind: string, by: string | null | undefined, at: string | null | undefined, note: string | null | undefined, amount: number) => {
    if (!at || !inPeriod(day(at), from, to)) return
    const key = `${bp || name}|${kind}`
    const held = setAside.get(key)
    if (held) held.amount += amount
    else setAside.set(key, { at: day(at), kind, name, bp, amount, by: nameOf(by), note: note ?? '' })
  }
  for (const c of input.companies) {
    if (c.bankrupt_declared_at) markAside(c.sap_bp_code ?? '', c.name, 'Bankrupt', c.bankrupt_declared_by, c.bankrupt_declared_at, c.bankrupt_note, c.total_amount ?? 0)
    if (isNoFollowup(c)) markAside(c.sap_bp_code ?? '', c.name, isDispute(c) ? 'Dispute' : 'No follow-up', c.no_followup_by, c.no_followup_at, c.no_followup_note, c.total_amount ?? 0)
  }
  for (const p of input.overduePayments) {
    const name = p.customer_name || p.bp_code
    if (p.bankrupt_declared_at) markAside(p.bp_code, name, 'Bankrupt', p.bankrupt_declared_by, p.bankrupt_declared_at, p.bankrupt_note, p.balance_due ?? 0)
    if (isNoFollowup(p)) markAside(p.bp_code, name, isDispute(p) ? 'Dispute' : 'No follow-up', p.no_followup_by, p.no_followup_at, p.no_followup_note, p.balance_due ?? 0)
  }

  /* ----- headline figures ----- */
  const given = tasks.length
  const done = tasks.filter((t) => t.result === 'done').length
  const allScores = [...scores.values()]
  // Kept: the customer has since paid (the same test as Follow-up history).
  const kept = summariseHistory(commitments as FollowupHistoryEntry[]).commitmentsKept
  const kpis = [
    { label: 'Follow-ups logged', value: String(followups.length) },
    { label: 'Customers contacted', value: String(new Set(followups.map((f) => account(f.entity_type, f.entity_id).bp || f.entity_id)).size) },
    { label: 'Payment promises', value: `${commitments.length} (${rupees(commitments.reduce((s, f) => s + (f.committed_amount ?? 0), 0))})` },
    { label: 'Promises kept', value: `${kept} of ${commitments.length}` },
    { label: 'Robi tasks done', value: `${done} of ${given}${given ? ` (${Math.round((done / given) * 100)}%)` : ''}` },
    { label: 'Team average score', value: scoreText(weekAverage(allScores)) },
    { label: 'Proof checks', value: `${proofs.length} (${proofs.filter((p) => p.status === 'approved').length} approved, ${proofs.filter((p) => p.status === 'missed').length} missed)` },
    { label: 'Set-aside requests', value: `${decisions.length} (${decisions.filter((d) => d.status === 'pending').length} waiting)` },
  ]

  /* ----- tables ----- */
  const byCoordinator: ReportTable = {
    title: 'Coordinator summary',
    head: ['Coordinator', 'Follow-ups', 'Calls', 'Emails', 'WhatsApp', 'Promises', 'Promised amount', 'Robi tasks done', 'Avg score', 'Proofs approved', 'Leave / half days'],
    numeric: [1, 2, 3, 4, 5, 6, 8, 9],
    rows: input.coordinators.map((c) => {
      const mineF = followups.filter((f) => f.coordinator_id === c.id)
      const mineT = tasks.filter((t) => t.coordinatorId === c.id)
      const mineP = proofs.filter((p) => p.coordinatorId === c.id)
      const away = attendance.filter((a) => a.userId === c.id)
      return [
        c.full_name,
        mineF.length,
        mineF.filter((f) => f.mode === 'call').length,
        mineF.filter((f) => f.mode === 'email').length,
        mineF.filter((f) => f.mode === 'whatsapp').length,
        mineF.filter((f) => f.committed_date).length,
        rupees(mineF.reduce((s, f) => s + (f.committed_amount ?? 0), 0)),
        `${mineT.filter((t) => t.result === 'done').length} / ${mineT.length}`,
        scoreText(weekAverage(scoresOf(c.id))),
        `${mineP.filter((p) => p.status === 'approved').length} / ${mineP.length}`,
        `${away.filter((a) => a.status === 'leave').length} / ${away.filter((a) => a.status === 'half_day').length}`,
      ]
    }),
  }

  const scoreRows: (string | number)[][] = []
  for (const c of input.coordinators) {
    const days = [...new Set([...scores.keys()].filter((k) => k.startsWith(`${c.id}|`)).map((k) => k.split('|')[1]))]
    const leaveDays = attendance.filter((a) => a.userId === c.id && a.status === 'leave').map((a) => a.date)
    for (const d of [...new Set([...days, ...leaveDays])].sort()) {
      const s: DayScore | undefined = scores.get(`${c.id}|${d}`)
      const status = leave.get(`${c.id}|${d}`)
      if (status === 'leave') scoreRows.push([pretty(d), c.full_name, '-', '-', 'Leave'])
      else if (s) scoreRows.push([pretty(d), c.full_name, s.done, s.given, `${scoreText(s.score)}${status === 'half_day' ? ' (half day)' : ''}`])
    }
  }

  const tables: ReportTable[] = [
    byCoordinator,
    {
      title: 'Daily scores',
      note: 'Score = tasks done out of tasks on Robi\'s list, shown as the gap from 100% (0% = all done, -20% = 80% done). Leave days are not scored.',
      head: ['Date', 'Coordinator', 'Done', 'Tasks', 'Score'],
      numeric: [2, 3, 4],
      rows: scoreRows,
    },
    {
      title: 'Follow-up log',
      note: 'Every follow-up logged in the period, oldest first.',
      head: ['Date', 'Time', 'Coordinator', 'Customer', 'BP code', 'Mode', 'Notes', 'Promise', 'Next follow-up'],
      widths: { 0: 21, 1: 15, 2: 26, 3: 42, 4: 14, 5: 16, 7: 30, 8: 21 },
      rows: followups.map((f) => {
        const a = account(f.entity_type, f.entity_id)
        return [
          pretty(f.followup_date || f.created_at),
          clock(f.created_at),
          nameOf(f.coordinator_id),
          a.name,
          a.bp,
          MODE[f.mode] ?? f.mode,
          [f.customer_response, f.notes].filter(Boolean).join(' - '),
          f.committed_date ? `${f.committed_amount ? `${rupees(f.committed_amount)} ` : ''}by ${pretty(f.committed_date)}` : '',
          pretty(f.next_reminder_date),
        ]
      }),
    },
    {
      title: 'Robi task history',
      note: 'Each task Robi gave, and how it ended. Leave days are left out; a half day counts its leftovers and four new tasks.',
      head: ['Date', 'Coordinator', 'Customer', 'Amount', 'Result', 'Done at'],
      widths: { 0: 24, 1: 34, 3: 30, 4: 34, 5: 38 },
      numeric: [3],
      rows: tasks.map((t) => [
        pretty(t.date),
        nameOf(t.coordinatorId),
        t.item.entityName ?? t.item.message,
        t.item.amount ? rupees(t.item.amount) : '',
        RESULT_LABEL[t.result],
        t.followup ? `${pretty(t.followup.created_at)} ${clock(t.followup.created_at)}` : '',
      ]),
    },
    {
      title: 'Proof checks',
      head: ['Date', 'Coordinator', 'Customer', 'Status', 'Sent at', 'Reviewed by', 'Note'],
      widths: { 0: 24, 1: 34, 3: 22, 4: 18, 5: 34 },
      rows: proofs
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
        .map((p) => [pretty(p.date), nameOf(p.coordinatorId), p.entityName, PROOF[p.status], p.submittedAt ? clock(p.submittedAt) : '', p.reviewedBy ? nameOf(p.reviewedBy) : '', p.reviewNote ?? '']),
    },
    {
      title: 'Set-aside requests and approvals',
      head: ['Asked on', 'Coordinator', 'Customer', 'Type', 'Amount', 'Reason', 'Decision', 'Decided by'],
      widths: { 0: 22, 1: 28, 3: 22, 4: 26, 7: 40 },
      numeric: [4],
      rows: decisions
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
        .map((d) => [
          pretty(d.requestedAt),
          nameOf(d.requestedBy),
          d.name,
          KIND[d.kind],
          rupees(d.amount),
          d.reason,
          d.status === 'pending' ? 'Waiting' : d.status === 'approved' ? 'Approved' : `Rejected${d.reviewNote ? `: ${d.reviewNote}` : ''}`,
          d.reviewedBy ? `${nameOf(d.reviewedBy)}, ${pretty(d.reviewedAt)}` : '',
        ]),
    },
    {
      title: 'Customers set aside (Bankrupt, No follow-up, Dispute)',
      note: 'Customers taken out of the lists in the period, with who decided and why.',
      head: ['Date', 'Type', 'Customer', 'BP code', 'Amount', 'By', 'Reason'],
      widths: { 0: 22, 1: 24, 3: 16, 4: 28, 5: 30 },
      numeric: [4],
      rows: [...setAside.values()]
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((r) => [pretty(r.at), r.kind, r.name, r.bp, rupees(r.amount), r.by, r.note]),
    },
    {
      title: 'Attendance',
      head: ['Date', 'Coordinator', 'Status', 'Marked by'],
      rows: attendance
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((a) => [pretty(a.date), nameOf(a.userId), a.status === 'leave' ? 'Leave' : 'Half day', nameOf(a.by)]),
    },
  ]

  return { from, to, kpis, tables }
}
