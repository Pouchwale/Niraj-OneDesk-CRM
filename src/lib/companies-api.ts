import type { Company, CompanyStatus } from './types'
import { demoCompanyStore } from './demo-companies'
import { todayISO } from './utils'
import { deriveCompanyStatus } from './status-rules'
import { isBankrupt, isNoFollowup } from './no-followup'

export interface CompanyStats {
  total: number
  overdue: number
  critical: number
  upcoming: number
  current: number
  paid: number
  totalOutstanding: number
  followupsDueToday: number
  /** Set aside: neither chased nor counted in totalOutstanding. */
  noFollowup: number
  noFollowupAmount: number
  /** Declared bankrupt: held out of the list and of totalOutstanding, like no follow-up. */
  bankrupt: number
  bankruptAmount: number
}

export async function getCompanies(coordinatorId?: string): Promise<Company[]> {
  let companies = demoCompanyStore.getAllCompanies()
  if (coordinatorId) {
    companies = companies.filter((c: any) => c.assigned_coordinator_id === coordinatorId)
  }
  
  // Sort by due_date ASC
  return [...companies].sort((a: any, b: any) => {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  })

}

export async function getCompanyById(id: string): Promise<Company | null> {
  return demoCompanyStore.getCompanyById(id) || null

}

export async function upsertCompany(
  data: Omit<Company, 'id' | 'created_at' | 'updated_at'>
): Promise<{ id: string; company: Company; wasCreated: boolean; before: number | null }> {
  const existing = demoCompanyStore.findExistingCompany(
    data.sap_bp_code,
    data.name,
    data.contact_number,
    data.invoice_no
  )
  // Read before the write, which is the only moment it still exists.
  const before = existing ? existing.total_amount ?? 0 : null
  const company = demoCompanyStore.upsertCompany(data as any) // Type override for Omit
  return { id: company.id, company, wasCreated: !existing, before }

}

export async function updateCompany(id: string, updates: Partial<Company>): Promise<void> {
  demoCompanyStore.updateCompany(id, updates)
  return

}

export async function reassignCompany(companyId: string, newCoordinatorId: string, actorId: string): Promise<void> {
  demoCompanyStore.reassignCompany(companyId, newCoordinatorId, actorId)
  return

}

export async function getCompanyStats(coordinatorId?: string): Promise<CompanyStats> {
  const stats = demoCompanyStore.getCompanyStats(coordinatorId)
  return { ...stats, followupsDueToday: demoCompanyStore.countFollowupsDueToday(coordinatorId) }

}

/**
 * Brings a batch of accounts to nil, for a sync reconciling against the file.
 *
 * One statement rather than a call per account: a workbook that has just been
 * paid down can settle hundreds at once, and a round trip each would take
 * longer than the import that found them.
 */
export async function settleCompanies(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0

  return demoCompanyStore.settleCompanies(ids)

}

/**
 * Retires records the invoice book has replaced, keeping their history.
 *
 * Not a settlement and not a deletion of anything real: the same debt is
 * already in the book under one record per invoice, and this removes the
 * customer-level row it used to sit in. See supersedeCompany in the demo store
 * for why the follow-ups move rather than going with it.
 */
export async function supersedeCompanies(
  pairs: { oldId: string; replacementIds: string[] }[]
): Promise<number> {
  const real = pairs.filter((p) => p.replacementIds.length > 0)
  if (real.length === 0) return 0

  for (const { oldId, replacementIds } of real) {
    demoCompanyStore.supersedeCompany(oldId, replacementIds)
  }
  return real.length

}

export async function deleteCompany(id: string): Promise<void> {
  demoCompanyStore.deleteCompany(id)
  return

}
