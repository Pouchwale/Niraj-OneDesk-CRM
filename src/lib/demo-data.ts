/**
 * OTIF roll-up used by the analytics page.
 *
 * This file once also held a second copy of the roster and generators for
 * fake daily entries and deliveries. None of that was reachable — the roster
 * lives in `users/store.ts` and the dashboards read real entries — so it is
 * gone, and what remains is the one function the OTIF page actually calls.
 */

import type { PoDelivery } from '@/lib/types'

export interface OtifSummary {
  totalPOs: number
  onTimeCount: number
  lateCount: number
  otifPercentage: number
  byCategory: Record<string, { total: number; onTime: number; pct: number }>
  byBucket: Record<string, number>
}

export function computeOtifSummary(deliveries: PoDelivery[]): OtifSummary {
  const totalPOs = deliveries.length
  const onTimeCount = deliveries.filter((d) => d.otif_score === 'YES').length
  const lateCount = totalPOs - onTimeCount

  const byCategory: Record<string, { total: number; onTime: number; pct: number }> = {}
  const byBucket: Record<string, number> = {}

  for (const d of deliveries) {
    // Category breakdown
    if (!byCategory[d.category]) {
      byCategory[d.category] = { total: 0, onTime: 0, pct: 0 }
    }
    byCategory[d.category].total++
    if (d.otif_score === 'YES') byCategory[d.category].onTime++

    // Delay bucket
    const bucket = d.delay_bucket || 'Unknown'
    byBucket[bucket] = (byBucket[bucket] || 0) + 1
  }

  // Compute percentages
  for (const cat of Object.keys(byCategory)) {
    const c = byCategory[cat]
    c.pct = c.total > 0 ? (c.onTime / c.total) * 100 : 0
  }

  return {
    totalPOs,
    onTimeCount,
    lateCount,
    otifPercentage: totalPOs > 0 ? (onTimeCount / totalPOs) * 100 : 0,
    byCategory,
    byBucket,
  }
}
