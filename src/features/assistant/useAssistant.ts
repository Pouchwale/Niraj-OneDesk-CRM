import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { getCompanies } from '@/lib/companies-api'
import { getOverduePayments } from '@/lib/overdue-api'
import { getFollowupSummaryByCompany } from '@/lib/followups-api'
import type { Company, Followup, OverduePayment } from '@/lib/types'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { getOpenAccountKeys } from '@/lib/open-accounts'
import { todayISO } from '@/lib/utils'

import { buildAssistantTasks } from './rules'
import { isSuppressed, loadAssistantState, markDone, snooze } from './assistant-state'
import { balanceLookup, customerLookup, dueDateLookup, openAccountKeys, resolvePlan, type ResolvedPlan } from './daily-plan'
import { ensurePlan, judgedOnAttendance, skipPlanItem, unskipPlanItem } from './plan-store'
import { planForAttendance } from './attendance'
import { proofRequestsDue } from './proof'
import type { AssistantIntent, AssistantTask } from './types'

/** Fetches every follow-up belonging to one coordinator. */
async function getMyFollowups(coordinatorId: string): Promise<Followup[]> {
  return demoCompanyStore.getAllFollowups().filter((f) => f.coordinator_id === coordinatorId)
}

export interface UseAssistantOptions {
  /** Hand this person a daily plan. Only coordinators work one. */
  withPlan?: boolean
}

/**
 * The coordinator's live picture: their accounts, their follow-ups, the
 * nudges those raise, and today's plan.
 *
 * Read-only by design. The robot never writes a follow-up: it points at the
 * record, the person logs what happened on that record's own timeline, and
 * the picture here updates from that. Live means live: the store announces
 * every change, so a call logged on any screen — or by a colleague on another
 * desktop, arriving from the server — updates the queue and the plan without
 * a reload.
 */
export function useAssistant(coordinatorId: string | undefined, options: UseAssistantOptions = {}) {
  const withPlan = options.withPlan ?? true
  const [companies, setCompanies] = useState<Company[]>([])
  const [overduePayments, setOverduePayments] = useState<OverduePayment[]>([])
  const [followups, setFollowups] = useState<Followup[]>([])
  /**
   * The whole book's open accounts, not just this coordinator's. Needed to
   * tell an account that has been dealt with from one that now belongs to
   * somebody else; only the keys are held, never the records.
   */
  const [owedKeys, setOwedKeys] = useState<Set<string>>(() => new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [stateVersion, setStateVersion] = useState(0)
  const [planVersion, setPlanVersion] = useState(0)
  // Who is in the office today: a leave or half day marked by the team leader changes the plan.
  const attendance = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.attendance)

  const load = useCallback(
    async (quiet = false) => {
      if (!coordinatorId) return
      if (!quiet) setIsLoading(true)
      try {
        const [comps, overdue, mine, owed] = await Promise.all([
          getCompanies(coordinatorId),
          getOverduePayments(coordinatorId),
          getMyFollowups(coordinatorId),
          getOpenAccountKeys(),
        ])
        setCompanies(comps)
        setOverduePayments(overdue)
        setFollowups(mine)
        setOwedKeys(owed)
      } catch (err) {
        console.error('Assistant could not load its data:', err)
      } finally {
        if (!quiet) setIsLoading(false)
      }
    },
    [coordinatorId]
  )

  useEffect(() => {
    load()
  }, [load])

  // Track work done on any other screen.
  useEffect(() => {
    if (!coordinatorId) return
    const refresh = () => {
      load(true)
    }
    // The store announces every change, so a call logged on any screen — or by
    // somebody else, arriving from the server — updates this without a reload.
    const unsubscribe = subscribeToDemoStore(refresh)
    window.addEventListener('focus', refresh)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', refresh)
    }
  }, [coordinatorId, load])

  /** Every nudge the records raise, before snoozes and dismissals. */
  const allTasks = useMemo(
    () => (coordinatorId ? buildAssistantTasks({ companies, overduePayments, followups }) : []),
    [coordinatorId, companies, overduePayments, followups]
  )

  /** The working queue: what is still to be answered today. */
  const tasks = useMemo(() => {
    if (!coordinatorId) return []
    const state = loadAssistantState(coordinatorId)
    // stateVersion is read so the list recomputes after a snooze or dismissal.
    void stateVersion
    return allTasks.filter((task) => !isSuppressed(state, task.id))
  }, [coordinatorId, allTasks, stateVersion])

  /**
   * Today's plan, made the first time the day's records are in and read
   * against them from then on. Never made while loading: a plan built from an
   * empty screen would be empty.
   */
  const plan = useMemo<ResolvedPlan | null>(() => {
    if (!coordinatorId || !withPlan || isLoading) return null
    void planVersion
    /*
     * What counts as finished: an account that has left the book of what is
     * owed — read from the records, not inferred from the nudge queue, which
     * empties itself for reasons that have nothing to do with the work.
     *
     * `mine` is this coordinator's share of that book. An account still owed
     * but no longer theirs has changed hands, which is not something they did.
     */
    const mine = openAccountKeys(companies, overduePayments)
    const owed = owedKeys.size > 0 ? owedKeys : mine
    // A call logged on any of the customer's records completes their task.
    const customerOf = customerLookup(companies, overduePayments)
    const balanceOf = balanceLookup(companies, overduePayments)
    const dueDateOf = dueDateLookup(companies)
    const made = ensurePlan(coordinatorId, todayISO(), allTasks, { followups, open: owed, mine, customerOf, balanceOf, dueDateOf, overduePayments, companies })
    // The day's plan already holds its overdue tasks; no extra rounds since 7 Oct 2026.
    // On leave or a half day, judged on what the day allows.
    void attendance
    return judgedOnAttendance(made, (p) => resolvePlan(p, allTasks, followups, coordinatorId, owed, mine, undefined, customerOf))
  }, [
    coordinatorId,
    withPlan,
    isLoading,
    allTasks,
    followups,
    companies,
    overduePayments,
    owedKeys,
    planVersion,
    attendance,
  ])

  // A picked task just done: Robi asks for its proof (ProofGate shows the screen).
  useEffect(() => {
    if (!coordinatorId || !plan) return
    const kept = demoCompanyStore.getDailyPlan(coordinatorId, plan.date)
    if (!kept) return
    // A half day asks for one proof, a leave for none.
    const done = new Set(plan.items.filter((i) => i.status === 'done').map((i) => i.taskId))
    const stored = planForAttendance(kept, demoCompanyStore.getAttendance(coordinatorId, plan.date)?.status, (id) => done.has(id))
    const due = proofRequestsDue(
      stored,
      plan,
      followups,
      demoCompanyStore.getProofRequests(),
      customerLookup(companies, overduePayments)
    )
    for (const request of due) demoCompanyStore.addProofRequest(request)
  }, [coordinatorId, plan, followups, companies, overduePayments])

  const skipItem = useCallback(
    (taskId: string) => {
      if (!coordinatorId) return
      skipPlanItem(coordinatorId, taskId)
      setPlanVersion((v) => v + 1)
    },
    [coordinatorId]
  )

  const unskipItem = useCallback(
    (taskId: string) => {
      if (!coordinatorId) return
      unskipPlanItem(coordinatorId, taskId)
      setPlanVersion((v) => v + 1)
    },
    [coordinatorId]
  )

  /**
   * Records how the coordinator answered a nudge. Nothing here touches a
   * follow-up: "open" leaves the nudge standing until the record itself
   * changes, "later" hides it until tomorrow, "dismiss" retires it.
   */
  const answer = useCallback(
    (task: AssistantTask, intent: AssistantIntent): void => {
      if (!coordinatorId) return

      if (intent === 'snooze') {
        snooze(coordinatorId, task.id)
        // "Later" on a planned item sets it aside for the day as well.
        if (plan?.items.some((item) => item.taskId === task.id)) skipPlanItem(coordinatorId, task.id)
        setStateVersion((v) => v + 1)
        setPlanVersion((v) => v + 1)
        return
      }

      if (intent === 'dismiss') {
        markDone(coordinatorId, task.id)
        setStateVersion((v) => v + 1)
      }
      // "open": the nudge stays until a follow-up is logged on the record.
    },
    [coordinatorId, plan]
  )

  return {
    tasks,
    allTasks,
    plan,
    companies,
    overduePayments,
    followups,
    isLoading,
    answer,
    skipItem,
    unskipItem,
    reload: load,
  }
}

/** Re-exported so pages can show the same count as the widget badge. */
export { getFollowupSummaryByCompany }
