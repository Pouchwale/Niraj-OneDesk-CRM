/**
 * Summary figures for the rows actually on screen.
 *
 * The cards above a list must describe the list. When a filter or the
 * "Critical & closing in" window narrows the rows, the cards are recomputed
 * from those rows with exactly the rules the unfiltered stats use (paid rows
 * carry no balance; critical on the ageing report is money past 90 days), so
 * the two never disagree about what "outstanding" means.
 *
 * Set aside — no follow-up or bankrupt — is out of every figure and every
 * count here. The lists leave those rows out as well; they are tallied on
 * their own lines only so their registers have something to read.
 */

import type { Company, OverduePayment } from './types'
import type { CompanyStats } from './companies-api'
import type { OverdueStats } from './overdue-api'
import { isBankrupt, isNoFollowup } from './no-followup'

export function companyRowStats(rows: Company[]): Omit<CompanyStats, 'followupsDueToday'> {
  const stats = {
    total: rows.length, overdue: 0, critical: 0, upcoming: 0, current: 0, paid: 0,
    noFollowup: 0, noFollowupAmount: 0, bankrupt: 0, bankruptAmount: 0, totalOutstanding: 0,
  }
  for (const c of rows) {
    if (isNoFollowup(c)) {
      stats.total--
      stats.noFollowup++
      stats.noFollowupAmount += c.total_amount || 0
      continue
    }
    if (isBankrupt(c)) {
      stats.total--
      stats.bankrupt++
      stats.bankruptAmount += c.total_amount || 0
      continue
    }
    if (c.status === 'overdue') stats.overdue++
    else if (c.status === 'critical') stats.critical++
    else if (c.status === 'upcoming') stats.upcoming++
    else if (c.status === 'current') stats.current++
    else if (c.status === 'paid') stats.paid++
    if (c.status !== 'paid') stats.totalOutstanding += c.total_amount || 0
  }
  return stats
}

export function overdueRowStats(rows: OverduePayment[]): OverdueStats {
  const stats: OverdueStats = {
    total: rows.length, critical: 0, overdue: 0, inProgress: 0, settled: 0,
    bankrupt: 0, bankruptBalance: 0, noFollowup: 0, noFollowupAmount: 0, totalBalance: 0,
  }
  for (const p of rows) {
    if (isNoFollowup(p)) {
      stats.total--
      stats.noFollowup++
      stats.noFollowupAmount += p.balance_due || 0
      continue
    }
    if (isBankrupt(p)) {
      stats.total--
      stats.bankrupt++
      stats.bankruptBalance += p.balance_due || 0
      continue
    }
    if (p.status === 'overdue') stats.overdue++
    else if (p.status === 'in_progress') stats.inProgress++
    else if (p.status === 'settled') stats.settled++
    if (p.status !== 'settled') {
      stats.totalBalance += p.balance_due || 0
      if ((p.due_91_120 || 0) > 0 || (p.due_121_plus || 0) > 0) stats.critical++
    }
  }
  return stats
}
