/**
 * Self leads: leads coordinators find themselves, and the reports the team
 * leader reads from them (5 Nov 2026). One record per lead; nothing here is
 * typed as a total.
 *
 *   Connected     the coordinator has spoken to the lead.
 *   Conversion    closed ÷ connected.
 *   Pipeline      value of the open leads.
 *   Value won     value of the closed leads.
 *   Referrals     leads a client gave as a reference (Referred by is set).
 *
 * Weeks run Saturday to Friday, the company's week (since 7 Nov 2026). Teams are the users'
 * module: GP3 or Pouchwale.
 */

import type { SelfLead, SelfLeadStatus, TeamModule } from './types'

export const SELF_LEAD_STATUS_LABEL: Record<SelfLeadStatus, string> = {
  open: 'Open',
  closed: 'Closed (won)',
  lost: 'Lost',
}

export const TEAMS: TeamModule[] = ['GP3', 'Pouchwale']

export function inLeadPeriod(l: Pick<SelfLead, 'date'>, from: string | null, to: string | null): boolean {
  if (from && l.date < from) return false
  if (to && l.date > to) return false
  return true
}

export interface LeadSummary {
  leads: number
  connected: number
  open: number
  closed: number
  lost: number
  /** Closed ÷ connected, 0-100; null with nothing connected. */
  conversion: number | null
  pipelineValue: number
  valueWon: number
  /** Leads that came as a reference from a client. */
  referrals: number
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function leadSummary(list: readonly SelfLead[]): LeadSummary {
  const connected = list.filter((l) => l.connected).length
  const closed = list.filter((l) => l.status === 'closed')
  const sum = (rows: readonly SelfLead[]) => round2(rows.reduce((s, l) => s + (l.value ?? 0), 0))
  return {
    leads: list.length,
    connected,
    open: list.filter((l) => l.status === 'open').length,
    closed: closed.length,
    lost: list.filter((l) => l.status === 'lost').length,
    conversion: connected ? Math.round((closed.length / connected) * 100) : null,
    pipelineValue: sum(list.filter((l) => l.status === 'open')),
    valueWon: sum(closed),
    referrals: list.filter((l) => Boolean(l.referred_by_name)).length,
  }
}

/** One line per person ('' = not assigned); everyone in `people` gets a line, at zero if they added nothing. Most value won first. */
export function leadsByPerson(list: readonly SelfLead[], people: readonly string[] = []): { personId: string; summary: LeadSummary }[] {
  const groups = new Map<string, SelfLead[]>(people.map((id) => [id, []]))
  for (const l of list) {
    const key = l.coordinator_id ?? ''
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  return [...groups.entries()]
    .map(([personId, rows]) => ({ personId, summary: leadSummary(rows) }))
    .sort((a, b) => b.summary.valueWon - a.summary.valueWon || b.summary.closed - a.summary.closed || b.summary.leads - a.summary.leads)
}

const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The leads a client has referred: linked to this lead, or (for leads typed
 * before it was picked) naming the same company.
 */
export function referencesFrom(lead: Pick<SelfLead, 'id' | 'company_name'>, all: readonly SelfLead[]): SelfLead[] {
  const name = nameKey(lead.company_name)
  return all
    .filter((l) => l.id !== lead.id && (l.referred_by_lead_id === lead.id || (!l.referred_by_lead_id && l.referred_by_name && nameKey(l.referred_by_name) === name)))
    .sort((a, b) => b.date.localeCompare(a.date))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The Saturday that starts a day's week (yyyy-mm-dd): the company's week runs Saturday to Friday (since 7 Nov 2026). */
export function weekStart(day: string): string {
  const t = new Date(`${day}T00:00:00Z`)
  const back = (t.getUTCDay() + 1) % 7 // Saturday 0 days back, Sunday 1, … Friday 6
  t.setUTCDate(t.getUTCDate() - back)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** The Friday that ends the week starting on Saturday `start`. */
export function weekEnd(start: string): string {
  const t = new Date(`${start}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + 6)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/**
 * Week by week (newest first), each team's summary and the total. A lead
 * whose coordinator is in no team counts in the total only.
 */
export function weeklyByTeam(
  list: readonly SelfLead[],
  teamOf: (coordinatorId: string | null) => TeamModule | null
): { week: string; teams: Record<TeamModule, LeadSummary>; total: LeadSummary }[] {
  const weeks = new Map<string, SelfLead[]>()
  for (const l of list) {
    const w = weekStart(l.date)
    weeks.set(w, [...(weeks.get(w) ?? []), l])
  }
  return [...weeks.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, rows]) => ({
      week,
      teams: Object.fromEntries(TEAMS.map((t) => [t, leadSummary(rows.filter((l) => teamOf(l.coordinator_id) === t))])) as Record<TeamModule, LeadSummary>,
      total: leadSummary(rows),
    }))
}
