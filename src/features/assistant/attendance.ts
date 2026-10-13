/**
 * Who is in the office. The team leader or the administrator marks a
 * coordinator on leave or on a half day; Robi plans accordingly (since
 * 10 Oct 2026):
 *
 *   leave     no plan that day. A plan already made is set aside whole, and
 *             its open tasks come forward to the next working day.
 *   half day  four fresh tasks instead of eight, leftovers still on top, and
 *             one proof check. Marked after an eight-task plan was made, the
 *             fresh tasks beyond four that are still undone come forward.
 *
 * The stored plan always keeps everything; what is cut here is cut from what
 * the day is judged on, so it is still open tomorrow and comes forward.
 */

import { PLAN_SIZE, type DailyPlan, type PlanItem } from './daily-plan'
import { isOnTop } from './note-pending'

export type AttendanceStatus = 'leave' | 'half_day'

/** Fresh tasks on a half day: half of the usual eight. */
export const HALF_DAY_TASKS = PLAN_SIZE

/**
 * What a half day keeps: every leftover from earlier days, every fresh task
 * already done, and undone fresh tasks in plan order until four are kept.
 */
export function keepForHalfDay<T>(list: T[], itemOf: (t: T) => PlanItem, isDone: (t: T) => boolean): T[] {
  const fresh = list.filter((t) => !isOnTop(itemOf(t)))
  let room = HALF_DAY_TASKS - fresh.filter(isDone).length
  return list.filter((t) => {
    if (isOnTop(itemOf(t)) || isDone(t)) return true
    if (room <= 0) return false
    room--
    return true
  })
}

/** The plan the day is judged on, given the coordinator's attendance. */
export function planForAttendance(
  plan: DailyPlan,
  status: AttendanceStatus | null | undefined,
  isDone: (taskId: string) => boolean
): DailyPlan {
  if (!status) return plan
  if (status === 'leave') return { ...plan, items: [], proofTaskIds: [] }
  const items = keepForHalfDay(plan.items, (i) => i, (i) => isDone(i.taskId))
  // One check on a half day; if its task was cut, a stand-in is found (proofTasksFor).
  return { ...plan, items, proofTaskIds: (plan.proofTaskIds ?? []).slice(0, 1) }
}
