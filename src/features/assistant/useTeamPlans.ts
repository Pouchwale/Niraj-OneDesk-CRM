import { useCallback, useEffect, useMemo, useState } from 'react'

import { getAllCoordinators } from '@/features/auth/AuthContext'
import { getCompanies } from '@/lib/companies-api'
import { getOverduePayments } from '@/lib/overdue-api'
import {
  getAllFollowups,
  getOverdueCommitmentDetails,
  type OverdueCommitment,
} from '@/lib/followups-api'
import { subscribeToDemoStore } from '@/lib/demo-companies'
import type { Company, Followup, OverduePayment } from '@/lib/types'
import { todayISO } from '@/lib/utils'
import { teamPlans, type TeamPlan } from './plan-store'

interface TeamData {
  companies: Company[]
  overduePayments: OverduePayment[]
  followups: Followup[]
  brokenPromises: OverdueCommitment[]
}

const EMPTY: TeamData = { companies: [], overduePayments: [], followups: [], brokenPromises: [] }

/**
 * The team's day, for whoever runs the team.
 *
 * Loads the whole book and works out every coordinator's plan from it - the
 * same plan each coordinator sees - and keeps it live as follow-ups land.
 */
export function useTeamPlans(enabled: boolean) {
  const [data, setData] = useState<TeamData>(EMPTY)
  const [isLoading, setIsLoading] = useState(enabled)
  const coordinators = useMemo(() => getAllCoordinators(), [])

  const load = useCallback(
    async (quiet = false) => {
      if (!enabled) return
      if (!quiet) setIsLoading(true)
      try {
        const [companies, overduePayments, followups, brokenPromises] = await Promise.all([
          getCompanies(),
          getOverduePayments(),
          getAllFollowups(),
          getOverdueCommitmentDetails(),
        ])
        setData({ companies, overduePayments, followups, brokenPromises })
      } catch (err) {
        console.error('Could not load the team for the assistant:', err)
      } finally {
        if (!quiet) setIsLoading(false)
      }
    },
    [enabled]
  )

  useEffect(() => {
    load()
  }, [load])

  // Stay current: the store announces every change, including the ones that
  // arrive from the server because a coordinator logged a call elsewhere.
  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      load(true)
    }
    const unsubscribe = subscribeToDemoStore(refresh)
    window.addEventListener('focus', refresh)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', refresh)
    }
  }, [enabled, load])

  const team = useMemo<TeamPlan[]>(() => {
    // Never plan from an empty screen: a plan made before the data landed
    // would be empty, and an empty plan is a plan nobody works.
    if (!enabled || isLoading) return []
    return teamPlans(coordinators, data.companies, data.overduePayments, data.followups, todayISO())
  }, [enabled, isLoading, coordinators, data])

  return {
    team,
    brokenPromises: data.brokenPromises,
    companies: data.companies,
    overduePayments: data.overduePayments,
    followups: data.followups,
    coordinators,
    isLoading,
    reload: load,
  }
}
