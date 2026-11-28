/**
 * The Final score by groups (28 Nov 2026, the user's layout): a weighted final
 * score shown as its groups — GP3's Performance, Follow-up, FMS and CAPA, or a
 * person's own — each cell the points that group took off the final score, so
 * the groups add up to the final (minus scoring). A group opens into its items,
 * each shown the same way. One table per team; its columns are the groups of
 * everyone's plans in that team, in order.
 *
 * Pure: no React (the page and its tests use it).
 */

import { groupShare, type WeightedFinal, type WeightItem } from './weightage'

export interface ItemScore {
  item: WeightItem
  /** Its share of the final score, in percent. */
  share: number
  /** 0-100; null: no score (counts as 0). */
  value: number | null
  /** Points it took off the final score (0 at full marks). */
  lost: number
}

export interface GroupScore {
  label: string
  /** The group's share of the final score; null for a CAPA deduction (100 less N per CAPA). */
  share: number | null
  lost: number
  items: ItemScore[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** The points an item takes off the final: its share times what it is short of 100. */
export const pointsLost = (share: number, value: number | null) => (share * (100 - (value ?? 0))) / 100

/** A person's final score split into their plan's groups and items. */
export function groupScores(f: WeightedFinal): GroupScore[] {
  if (!f.plan) return []
  if (f.plan.capaDeduction) return [{ label: 'CAPA', share: null, lost: round1(f.plan.capaDeduction * (f.capas ?? 0)), items: [] }]
  return f.plan.groups.map((g) => {
    const items = f.parts.filter((p) => p.group === g.label).map((p) => ({ item: p.item, share: p.share, value: p.value, lost: pointsLost(p.share, p.value) }))
    return {
      label: g.label,
      share: groupShare(g),
      lost: round1(items.reduce((a, i) => a + i.lost, 0)),
      items: items.map((i) => ({ ...i, lost: round1(i.lost) })),
    }
  })
}

export interface GroupColumn {
  label: string
  /** The share when everyone with this group has the same one, else null. */
  share: number | null
  items: { item: WeightItem; share: number | null }[]
}

/** A team table's columns: every group of its people's plans, in order of first appearance, with their items. */
export function groupColumns(rows: readonly GroupScore[][]): GroupColumn[] {
  const cols: { label: string; shares: Set<number | null>; items: Map<WeightItem, Set<number>> }[] = []
  for (const groups of rows) {
    for (const g of groups) {
      let col = cols.find((c) => c.label === g.label)
      if (!col) cols.push((col = { label: g.label, shares: new Set(), items: new Map() }))
      col.shares.add(g.share)
      for (const i of g.items) {
        if (!col.items.has(i.item)) col.items.set(i.item, new Set())
        col.items.get(i.item)!.add(i.share)
      }
    }
  }
  return cols.map((c) => ({
    label: c.label,
    share: c.shares.size === 1 ? [...c.shares][0] : null,
    items: [...c.items.entries()].map(([item, shares]) => ({ item, share: shares.size === 1 ? [...shares][0] : null })),
  }))
}

/** Points lost as the page writes them: 0 reads "0", 8 reads "-8", 12.25 reads "-12.3". */
export function formatLost(lost: number | null | undefined): string {
  if (lost === null || lost === undefined) return '—'
  const r = round1(lost)
  return r === 0 ? '0' : `-${Number.isInteger(r) ? r : r.toFixed(1)}`
}
