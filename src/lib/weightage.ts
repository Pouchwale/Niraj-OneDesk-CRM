/**
 * The final score weightage (27 Nov 2026, the user's rules): from Saturday
 * 28 Nov 2026 each coordinator has ONE final score, the weighted sum of their
 * items, replacing the Payments and Operations scores. Periods that start
 * before then keep the two scores as they were.
 *
 * The administrator keeps the weightage (the "indexing") in the Admin Panel:
 * a plan for a whole team or for particular people, each made of groups
 * (e.g. GP3 "Performance 40%") holding items with their share of the whole
 * score. The items are every CRM score plus CAPA and FMS, which come from
 * another app later. The user's rule: no scaling up or down — an item with no
 * score (CAPA and FMS until that app is connected) counts as zero for its share.
 *
 * Vishva's rule: 100 by default, less 20 for each CAPA assigned to her
 * (a "CAPA deduction" plan); until the CAPA app is connected, none are known.
 *
 * Pure: no React, no storage, relative imports only (the server bundles it).
 */

import { finalPart, SCORE_MODULES, type PeriodScores, type ScoreEntry, type ScoreModule } from './score-history'

/** The first day the weightage counts: periods starting on or after it use it (the user: from next week). */
export const WEIGHTING_FROM = '2026-11-28'

export type WeightItem = ScoreModule | 'capa' | 'fms'

export const WEIGHT_ITEMS: { id: WeightItem; label: string; outside?: boolean }[] = [
  ...SCORE_MODULES.map((m) => ({ id: m.id as WeightItem, label: m.label })),
  { id: 'capa', label: 'CAPA', outside: true },
  { id: 'fms', label: 'FMS', outside: true },
]
export const weightItemLabel = (id: WeightItem) => WEIGHT_ITEMS.find((i) => i.id === id)?.label ?? id

export interface WeightGroup {
  label: string
  /** Each item's share of the whole final score, in percent. The group's share is their sum. */
  items: Partial<Record<WeightItem, number>>
}

export interface WeightPlan {
  id: string
  name: string
  /** A whole team (the users' module, GP3 or Pouchwale). */
  team?: string | null
  /** Particular people; a person's own plan beats their team's. */
  coordinatorIds?: string[]
  groups: WeightGroup[]
  /** Instead of groups: 100 less this many points for each CAPA assigned (Vishva). */
  capaDeduction?: number | null
  updatedAt?: string
  updatedBy?: string
}

export interface WeightingSetting {
  from: string
  plans: WeightPlan[]
  updatedAt?: string
  updatedBy?: string
}

/** What a period carries: the plans as they stood when it locked (open: now), and whose plan each coordinator is on. */
export interface PeriodWeighting {
  from: string
  plans: WeightPlan[]
  /** coordinatorId → plan id. */
  planOf: Record<string, string>
}

const round2 = (n: number) => Math.round(n * 100) / 100
export const groupShare = (g: WeightGroup) => round2(Object.values(g.items).reduce((a: number, v) => a + (v ?? 0), 0))
export const planTotal = (p: Pick<WeightPlan, 'groups'>) => round2(p.groups.reduce((a, g) => a + groupShare(g), 0))

/** The plans the user gave on 27 Nov 2026; the administrator changes them in the Admin Panel. */
export const DEFAULT_WEIGHTING: WeightingSetting = {
  from: WEIGHTING_FROM,
  plans: [
    {
      id: 'gp3',
      name: 'GP3 team',
      team: 'GP3',
      groups: [
        { label: 'Performance', items: { kpi: 20, self_leads: 20 } },
        { label: 'Follow-up', items: { service: 10, quotations: 10, robi: 10 } },
        { label: 'FMS', items: { fms: 20 } },
        { label: 'CAPA', items: { capa: 10 } },
      ],
    },
    {
      id: 'avani',
      name: 'Avani Patel',
      coordinatorIds: ['coord-11'],
      groups: [
        { label: 'RFD follow-up (Robi)', items: { robi: 50 } },
        { label: 'CAPA', items: { capa: 20 } },
        { label: 'FMS', items: { fms: 30 } },
      ],
    },
    {
      id: 'krina',
      name: 'Krina Shah',
      coordinatorIds: ['coord-7'],
      groups: [
        { label: 'Robi follow-up', items: { robi: 40 } },
        { label: 'CAPA', items: { capa: 20 } },
        { label: 'FMS', items: { fms: 40 } },
      ],
    },
    {
      id: 'disha-acharya',
      name: 'Disha Acharya',
      coordinatorIds: ['user-mu6lihq4-pcxcy'],
      groups: [
        { label: 'Robi follow-up', items: { robi: 40 } },
        { label: 'FMS', items: { fms: 40 } },
        { label: 'CAPA', items: { capa: 20 } },
      ],
    },
    { id: 'vishva', name: 'Vishva Vyas', coordinatorIds: ['coord-9'], groups: [], capaDeduction: 20 },
  ],
}

/** A plan as given, checked. Throws a message for the screen. */
export function checkWeightPlan(value: unknown): Omit<WeightPlan, 'updatedAt' | 'updatedBy'> {
  const v = (value ?? {}) as Record<string, unknown>
  const name = String(v.name ?? '').trim()
  if (!name) throw new Error('Give the weightage a name.')
  const team = typeof v.team === 'string' && v.team.trim() ? v.team.trim() : null
  const ids = Array.isArray(v.coordinatorIds) ? [...new Set(v.coordinatorIds.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))] : []
  if (!team && !ids.length) throw new Error(`${name}: choose a team or at least one person.`)
  const deduction = v.capaDeduction === null || v.capaDeduction === undefined || v.capaDeduction === '' ? null : Number(v.capaDeduction)
  if (deduction !== null && (!Number.isFinite(deduction) || deduction <= 0 || deduction > 100)) throw new Error(`${name}: the CAPA deduction must be between 1 and 100.`)
  const groups: WeightGroup[] = []
  for (const raw of Array.isArray(v.groups) ? v.groups : []) {
    const g = (raw ?? {}) as { label?: unknown; items?: unknown }
    const label = String(g.label ?? '').trim()
    const items: WeightGroup['items'] = {}
    for (const [key, share] of Object.entries((g.items ?? {}) as Record<string, unknown>)) {
      const item = WEIGHT_ITEMS.find((i) => i.id === key)
      if (!item) throw new Error(`${name}: there is no item called "${key}".`)
      const n = typeof share === 'number' ? share : Number(share)
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${name}: ${item.label} needs a share from 0 to 100.`)
      if (round2(n) > 0) items[item.id] = round2(n)
    }
    if (!label && !Object.keys(items).length) continue
    if (!label) throw new Error(`${name}: every group needs a name.`)
    groups.push({ label, items })
  }
  const used = groups.flatMap((g) => Object.keys(g.items))
  const twice = used.find((id, i) => used.indexOf(id) !== i)
  if (twice) throw new Error(`${name}: ${weightItemLabel(twice as WeightItem)} is in two groups.`)
  if (deduction === null) {
    const total = planTotal({ groups })
    if (Math.abs(total - 100) > 0.001) throw new Error(`${name}: the shares add up to ${total}%; they must add up to 100%.`)
  }
  return { id: String(v.id ?? '').trim() || '', name, ...(team ? { team } : {}), ...(ids.length ? { coordinatorIds: ids } : {}), groups: deduction === null ? groups : [], ...(deduction !== null ? { capaDeduction: deduction } : {}) }
}

/** The whole setting as given, checked: every plan, and nobody on two personal plans or a team twice. */
export function checkWeighting(value: unknown): Pick<WeightingSetting, 'from' | 'plans'> {
  const v = (value ?? {}) as { from?: unknown; plans?: unknown }
  const from = typeof v.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.from) ? v.from : WEIGHTING_FROM
  const plans = (Array.isArray(v.plans) ? v.plans : []).map((p, i) => {
    const checked = checkWeightPlan(p)
    return { ...checked, id: checked.id || `plan-${i + 1}` }
  })
  const ids = plans.map((p) => p.id)
  if (new Set(ids).size !== ids.length) throw new Error('Two weightages have the same id.')
  const teams = plans.filter((p) => !p.coordinatorIds?.length && p.team).map((p) => p.team!)
  const teamTwice = teams.find((t, i) => teams.indexOf(t) !== i)
  if (teamTwice) throw new Error(`The ${teamTwice} team has two weightages.`)
  const people = plans.flatMap((p) => p.coordinatorIds ?? [])
  const personTwice = people.find((p, i) => people.indexOf(p) !== i)
  if (personTwice) throw new Error('A person is on two personal weightages.')
  return { from, plans }
}

/** Whose plan each coordinator is on: their own, else their team's. */
export function planOfPeople(plans: readonly WeightPlan[], people: readonly { id: string; team: string | null }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const person of people) {
    const own = plans.find((p) => p.coordinatorIds?.includes(person.id))
    const team = person.team ? plans.find((p) => !p.coordinatorIds?.length && p.team === person.team) : undefined
    const plan = own ?? team
    if (plan) out[person.id] = plan.id
  }
  return out
}

/** One item's value on the 0-100 scale; null when it has no score (counts as 0 for its share). */
function itemValue(entries: readonly Pick<ScoreEntry, 'coordinatorId' | 'module' | 'score'>[], coordinatorId: string, item: WeightItem): number | null {
  if (item === 'capa' || item === 'fms') return null // The CAPA / FMS app is not connected yet.
  const e = entries.find((x) => x.coordinatorId === coordinatorId && x.module === item)
  return e ? finalPart(e) : null
}

export interface WeightedPart {
  item: WeightItem
  group: string
  share: number
  /** 0-100; null: no score, counted as 0. */
  value: number | null
}

export interface WeightedFinal {
  /** Out of 100 (shown less 100, minus scoring); null without a plan. */
  score: number | null
  plan: WeightPlan | null
  parts: WeightedPart[]
  /** CAPAs counted (CAPA deduction plans). */
  capas?: number
}

/** A coordinator's one final score for a period that uses the weightage. */
export function weightedFinalOf(period: Pick<PeriodScores, 'entries'> & { weighting?: PeriodWeighting | null }, coordinatorId: string): WeightedFinal {
  const w = period.weighting
  const plan = w ? w.plans.find((p) => p.id === w.planOf[coordinatorId]) ?? null : null
  if (!plan) return { score: null, plan: null, parts: [] }
  if (plan.capaDeduction) {
    const capas = 0 // The CAPA app is not connected yet: none known.
    return { score: Math.max(0, 100 - plan.capaDeduction * capas), plan, parts: [], capas }
  }
  const parts: WeightedPart[] = []
  for (const g of plan.groups) {
    for (const [item, share] of Object.entries(g.items) as [WeightItem, number][]) {
      parts.push({ item, group: g.label, share, value: itemValue(period.entries, coordinatorId, item) })
    }
  }
  const sum = parts.reduce((a, p) => a + (p.share * (p.value ?? 0)) / 100, 0)
  return { score: Math.round(sum * 10) / 10, plan, parts }
}

/** "Performance 40%: Regular Overdue -20 × 20%, …" for the tooltip and Excel. */
export function weightedDetail(f: WeightedFinal, fmt: (value: number) => string): string {
  if (!f.plan) return 'No weightage is set for this person (Admin Panel → Final score weightage).'
  if (f.plan.capaDeduction) return `${f.plan.name}: 100 less ${f.plan.capaDeduction} for each CAPA assigned; ${f.capas ?? 0} CAPA (the CAPA app is not connected yet).`
  const byGroup = f.plan.groups.map((g) => {
    const items = f.parts
      .filter((p) => p.group === g.label)
      .map((p) => `${weightItemLabel(p.item)} ${p.value === null ? (p.item === 'capa' || p.item === 'fms' ? 'not connected yet (0)' : 'no score (0)') : fmt(p.value)} × ${p.share}%`)
    return `${g.label} ${groupShare(g)}%: ${items.join(', ')}`
  })
  return `${f.plan.name} · ${byGroup.join(' · ')}`
}
