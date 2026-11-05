/**
 * Billing issues: the log coordinators keep of billing mistakes, and the score
 * each coordinator gets from it (the BILLING_ISSUES sheet's rules).
 *
 * The score reads Responsible Person 1 only, as the sheet does (user's choice,
 * 5 Nov 2026); persons 2 and 3 are recorded but not counted. The period is
 * read on the issue's "Date" (the day it was logged), as the sheet's COUNTIFS
 * on column B does. Departments ("Billing", "Production side") are never a
 * coordinator, so they never count.
 */

import { datesByNeighbours, pickDate, sheetDateCandidates } from './sheet-dates'
import type { BillingIssue } from './types'

export { pickDate, sheetDateCandidates }

/** Names that are not a person, offered alongside the team when choosing who is responsible. */
export const BILLING_DEPARTMENTS = [
  'Billing',
  "Customer's side",
  'Production side',
  'Marketing person',
  'Designer',
  'Dispatch Team',
  'Transportation side',
] as const

/** The stepped scale: the score for a given number of issues in the period. */
export const BILLING_SCORE_TIERS: { label: string; min: number; max: number | null; score: number }[] = [
  { label: '0 issues', min: 0, max: 0, score: 100 },
  { label: '1 issue', min: 1, max: 1, score: 50 },
  { label: '2 issues', min: 2, max: 2, score: 0 },
  { label: '3 to 5', min: 3, max: 5, score: -25 },
  { label: '6 to 10', min: 6, max: 10, score: -50 },
  { label: 'More than 10', min: 11, max: null, score: -100 },
]

/** 0 → 100, 1 → 50, 2 → 0, 3-5 → -25, 6-10 → -50, more → -100. */
export function billingIssueScore(issues: number): number {
  if (issues <= 0) return 100
  if (issues === 1) return 50
  if (issues === 2) return 0
  if (issues <= 5) return -25
  if (issues <= 10) return -50
  return -100
}

/** Whether an issue was logged inside the period (yyyy-mm-dd, inclusive; null = open-ended). */
export function inBillingPeriod(issue: Pick<BillingIssue, 'date'>, from: string | null, to: string | null): boolean {
  if (from && issue.date < from) return false
  if (to && issue.date > to) return false
  return true
}

/**
 * Each coordinator's issues and score for the period. Every coordinator gets a
 * line, at 100 with no issues. Worst score first, then most issues.
 */
export function billingScores(
  issues: readonly BillingIssue[],
  coordinatorIds: readonly string[],
  from: string | null,
  to: string | null
): { coordinatorId: string; issues: number; score: number }[] {
  const counts = new Map<string, number>(coordinatorIds.map((id) => [id, 0]))
  for (const issue of issues) {
    const who = issue.responsible_1
    if (!who || !counts.has(who) || !inBillingPeriod(issue, from, to)) continue
    counts.set(who, (counts.get(who) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([coordinatorId, n]) => ({ coordinatorId, issues: n, score: billingIssueScore(n) }))
    .sort((a, b) => a.score - b.score || b.issues - a.issues)
}

/** A person to match a typed name against. */
export interface BillingPerson {
  id: string
  full_name: string
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The responsible person as stored: a user id when the name is someone in the
 * CRM (full name or first name, any case), otherwise the text as written.
 */
export function resolveResponsible(text: string | null | undefined, people: readonly BillingPerson[]): string | null {
  const typed = (text ?? '').trim()
  if (!typed) return null
  const wanted = clean(typed)
  const byId = people.find((p) => p.id === typed)
  if (byId) return byId.id
  const byName = people.find((p) => clean(p.full_name) === wanted)
  if (byName) return byName.id
  const byFirst = people.filter((p) => clean(p.full_name).split(' ')[0] === wanted)
  if (byFirst.length === 1) return byFirst[0].id
  // "Disha A", "Disha c": first name and the start of the surname.
  const [first, last] = wanted.split(' ')
  if (first && last && wanted.split(' ').length === 2) {
    const byInitial = people.filter((p) => {
      const [f, ...rest] = clean(p.full_name).split(' ')
      return f === first && rest.join(' ').startsWith(last)
    })
    if (byInitial.length === 1) return byInitial[0].id
  }
  return typed.replace(/\s+/g, ' ')
}

/* ===================== The old sheet, imported once (5 Nov 2026) ===================== */

const sheetText = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s === '' || s === '-' || s.toLowerCase() === 'none' ? null : s
}

/**
 * The old sheet's rows (header names as in the sheet, merged cells already
 * filled down) as billing issues. Rows are in Sr. No order, which is roughly
 * date order, so an ambiguous Date is read the way nearer its neighbours'
 * clear dates; Issue and Solution dates the way nearer the row's own Date.
 * Rows with no date, customer or issue at all are left out.
 */
export function billingIssuesFromSheet(
  rows: Record<string, unknown>[],
  people: readonly BillingPerson[],
  importedAt: string,
  today: string
): { issues: BillingIssue[]; skipped: number; reread: number } {
  const used = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => ['Date', 'Customer Name', 'Issue', 'Responsible Person 1'].some((k) => sheetText(row[k])))
  const dateOptions = used.map(({ row }) => sheetDateCandidates(row['Date']))
  const dates = datesByNeighbours(dateOptions, today)

  let reread = 0
  let skipped = rows.length - used.length
  const issues: BillingIssue[] = []
  used.forEach(({ row, index }, i) => {
    const date = dates[i]
    if (!date) {
      skipped++
      return
    }
    const other = (key: string) => {
      const options = sheetDateCandidates(row[key])
      const picked = pickDate(options, date, today)
      if (picked && options.length > 1 && picked !== options[0]) reread++
      return picked
    }
    if (dateOptions[i].length > 1 && date !== dateOptions[i][0]) reread++

    const srNo = Number(row['Sr. No'])
    issues.push({
      id: `billing-import-${index + 2}`,
      sr_no: Number.isFinite(srNo) && srNo > 0 ? srNo : 0,
      date,
      responsible_1: resolveResponsible(sheetText(row['Responsible Person 1']), people),
      responsible_2: resolveResponsible(sheetText(row['Responsible Person 2']), people),
      responsible_3: resolveResponsible(sheetText(row['Responsible Person 3']), people),
      customer_name: sheetText(row['Customer Name']) ?? '-',
      issue: sheetText(row['Issue']) ?? '',
      issue_date: other('Issue Date'),
      solution: sheetText(row['Solution']),
      solution_date: other('Solution Date'),
      invoice_no: sheetText(row['Invoice Number']),
      cn_no: sheetText(row['CN Number']),
      dn_no: sheetText(row['DN Number']),
      account_remarks: sheetText(row['Account Team Remarks']),
      coordinator_remarks: sheetText(row['Coordinator Team Remarks']),
      created_at: importedAt,
      created_by: null,
      updated_at: importedAt,
      updated_by: null,
    })
  })
  return { issues, skipped, reread }
}

/** The next Sr. No after the highest used. */
export function nextBillingSrNo(issues: readonly Pick<BillingIssue, 'sr_no'>[]): number {
  return issues.reduce((max, i) => Math.max(max, Number(i.sr_no) || 0), 0) + 1
}
