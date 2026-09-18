import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useAuth, getAllCoordinators } from '@/features/auth/AuthContext'
import { useDailyEntries } from '@/features/daily-logs/hooks/useDailyEntries'
import { todayISO } from '@/lib/utils'
import { getFollowupCommitments, type Commitment } from '@/lib/followups-api'
import type { Company, OverduePayment } from '@/lib/types'
import { getCompanies } from '@/lib/companies-api'
import { getOverduePayments } from '@/lib/overdue-api'
import { buildRoleKpis, kpiSectionTitle, type RoleKpi } from '../role-kpis'
import { readSyncLog } from '@/lib/sync-log'

interface Snapshot {
  commitments: Commitment[]
  companies: Company[]
  overduePayments: OverduePayment[]
}

const EMPTY: Snapshot = {
  commitments: [],
  companies: [],
  overduePayments: [],
}

/**
 * Loads the records and derives the KPIs for whoever is signed in.
 *
 * What is owed comes from Active Payments and the ageing report, counted one
 * line per customer, so the dashboard total is the Overview total. Promises
 * come from the follow-ups the coordinators logged.
 */
export function useRoleKpis(): {
  kpis: RoleKpi[]
  sectionTitle: string
  isLoading: boolean
} {
  const { user } = useAuth()
  const { entries } = useDailyEntries()

  const [records, setRecords] = useState<Snapshot>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [commitments, companies, overduePayments] = await Promise.all([
          // Promises the team logged - the ones the Overview and the bell count.
          getFollowupCommitments(),
          // Unscoped: the KPI builder filters by owner, and the admin needs all of it.
          getCompanies(),
          getOverduePayments(),
        ])
        if (!cancelled) setRecords({ commitments, companies, overduePayments })
      } catch {
        // The page still renders, but nobody should read a zero as a fact.
        if (!cancelled) {
          setRecords(EMPTY)
          toast.error('Could not load the records, so the figures below are blank rather than real.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const kpis = useMemo(() => {
    if (!user) return []
    return buildRoleKpis({
      today: todayISO(),
      userId: user.id,
      role: user.role,
      entries,
      coordinatorCount: getAllCoordinators().length,
      // Only the administrator reads this, but it costs nothing to carry.
      syncLog: readSyncLog(),
      ...records,
    })
  }, [user, entries, records])

  return {
    kpis,
    sectionTitle: user ? kpiSectionTitle(user.role) : '',
    isLoading,
  }
}
