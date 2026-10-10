/**
 * Robi's proof checks: two of each day's tasks, picked at random when the plan
 * is made, ask for a screenshot of the call, email or meeting the moment the
 * coordinator logs it. They have ten minutes; the team leader or the
 * administrator reviews what they send.
 */

import type { Followup, ProofRequest } from '@/lib/types'
import { entityKeyOf, isExtraItem, type CustomerOf, type DailyPlan, type ResolvedPlan } from './daily-plan'

export const PROOFS_PER_DAY = 2
export const PROOF_MINUTES = 10

/** Two of the day's tasks, at random. */
export function pickProofTasks(items: { taskId: string }[], count = PROOFS_PER_DAY): string[] {
  const ids = items.map((i) => i.taskId)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids.slice(0, count)
}

export const proofIdFor = (date: string, taskId: string) => `proof:${date}:${taskId}`

/** A fixed shuffle per day, so every screen picks the same stand-in. */
const shuffleKey = (date: string, taskId: string) => {
  let h = 2166136261
  for (const ch of `${date}|${taskId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/**
 * The tasks that carry today's proof checks. A picked task that ended without
 * a call - set aside, paid, handed to someone else - can never be proved, so
 * another task on the plan stands in for it, chosen by a fixed shuffle of the
 * day: asked when it is done, or at once if it already is. Since
 * 7 Oct 2026; before, such a day simply had one check fewer.
 */
export function proofTasksFor(stored: DailyPlan, resolved: ResolvedPlan, asked: Set<string>): Set<string> {
  const target = Math.min(PROOFS_PER_DAY, (stored.proofTaskIds ?? []).length)
  const ended = (s: string) => s === 'closed' || s === 'moved'
  const items = resolved.items.filter((i) => !isExtraItem(i))
  const chosen = new Set<string>()
  // Whatever was already asked counts, whatever happened since.
  for (const i of items) if (asked.has(proofIdFor(stored.date, i.taskId))) chosen.add(i.taskId)
  for (const id of stored.proofTaskIds ?? []) {
    const item = items.find((i) => i.taskId === id)
    if (item && !ended(item.status)) chosen.add(id)
  }
  const spare = items
    .filter((i) => !chosen.has(i.taskId) && !ended(i.status) && !(stored.proofTaskIds ?? []).includes(i.taskId))
    // A fixed order: preferring tasks still to do would move the stand-in the
    // moment it was done, and nothing would ever be asked.
    .sort((a, b) => shuffleKey(stored.date, a.taskId) - shuffleKey(stored.date, b.taskId))
  for (const i of spare) {
    if (chosen.size >= target) break
    chosen.add(i.taskId)
  }
  return chosen
}

/**
 * The proof requests a coordinator's plan now owes: a proof task that has
 * been done and has not been asked about yet. The follow-up that did it is the
 * coordinator's latest on that customer since the plan was made.
 */
export function proofRequestsDue(
  stored: DailyPlan,
  resolved: ResolvedPlan,
  followups: Followup[],
  existing: { id: string }[],
  customerOf?: CustomerOf,
  now: Date = new Date()
): ProofRequest[] {
  if ((stored.proofTaskIds ?? []).length === 0) return []
  const asked = new Set(existing.map((r) => r.id))
  const picked = proofTasksFor(stored, resolved, asked)
  const customer = (key: string) => customerOf?.(key) ?? key

  return resolved.items
    .filter((item) => picked.has(item.taskId) && item.status === 'done' && !asked.has(proofIdFor(stored.date, item.taskId)))
    .map((item) => {
      const key = customer(entityKeyOf(item) ?? '')
      const followup = followups
        .filter((f) => f.coordinator_id === stored.userId && f.created_at >= stored.createdAt)
        .filter((f) => customer(`${f.entity_type}:${f.entity_id}`) === key)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      return {
        id: proofIdFor(stored.date, item.taskId),
        coordinatorId: stored.userId,
        date: stored.date,
        taskId: item.taskId,
        entityType: item.entityType ?? 'company',
        entityId: item.entityId ?? '',
        entityName: item.entityName ?? 'Account',
        followupId: followup?.id ?? null,
        requestedAt: now.toISOString(),
        dueAt: new Date(now.getTime() + PROOF_MINUTES * 60_000).toISOString(),
        status: 'pending' as const,
      }
    })
}
