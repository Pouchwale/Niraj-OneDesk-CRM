import { describe, expect, it } from 'vitest'

import type { Followup } from '@/lib/types'
import { proofRefusal } from '../../../server/modules/data/operations'
import type { DailyPlan, ResolvedPlan } from './daily-plan'
import { PROOF_MINUTES, pickProofTasks, proofIdFor, proofRequestsDue, proofTasksFor } from './proof'

const items = Array.from({ length: 8 }, (_, i) => ({ taskId: `t${i}`, entityType: 'company' as const, entityId: `c${i}`, entityName: `C${i}`, kind: 'stale_contact' as const, message: '' }))
const stored: DailyPlan = { userId: 'coord-1', date: '2026-10-07', items, skipped: [], createdAt: '2026-10-07T03:00:00.000Z', proofTaskIds: ['t2', 't5'] }
const resolved = (done: string[]): ResolvedPlan =>
  ({ ...stored, items: items.map((i) => ({ ...i, status: done.includes(i.taskId) ? 'done' : 'open' })) }) as unknown as ResolvedPlan
const call = (entityId: string, at: string): Followup =>
  ({ id: `fu-${entityId}`, entity_type: 'company', entity_id: entityId, coordinator_id: 'coord-1', created_at: at, followup_date: at }) as Followup

describe("Robi's proof checks", () => {
  it('picks exactly two different tasks', () => {
    const picked = pickProofTasks(items)
    expect(picked).toHaveLength(2)
    expect(new Set(picked).size).toBe(2)
  })

  it('asks only when a picked task is done, with a 10-minute deadline and the follow-up behind it', () => {
    const now = new Date('2026-10-07T06:00:00.000Z')
    const due = proofRequestsDue(stored, resolved(['t1', 't2']), [call('c2', '2026-10-07T05:59:00.000Z')], [], undefined, now)
    expect(due.map((r) => r.taskId)).toEqual(['t2'])
    expect(due[0]).toMatchObject({ followupId: 'fu-c2', status: 'pending', coordinatorId: 'coord-1' })
    expect(Date.parse(due[0].dueAt) - now.getTime()).toBe(PROOF_MINUTES * 60_000)
  })

  it('never asks twice for the same task', () => {
    const due = proofRequestsDue(stored, resolved(['t2']), [], [{ id: proofIdFor('2026-10-07', 't2') }])
    expect(due).toHaveLength(0)
  })

  const withStatus = (s: Record<string, string>): ResolvedPlan =>
    ({ ...stored, items: items.map((i) => ({ ...i, status: s[i.taskId] ?? 'open' })) }) as unknown as ResolvedPlan

  it('moves a check to another task when the picked one ends without a call', () => {
    // t5 was set aside by the team leader: nothing to prove there.
    const open = proofTasksFor(stored, withStatus({ t5: 'closed' }), new Set())
    expect(open.size).toBe(2)
    expect(open.has('t2')).toBe(true)
    expect(open.has('t5')).toBe(false)
    // The same stand-in on every screen, and it holds as the day goes on.
    const standIn = [...open].find((id) => id !== 't2')!
    expect([...proofTasksFor(stored, withStatus({ t5: 'closed' }), new Set())]).toEqual([...open])
    const due = proofRequestsDue(stored, withStatus({ t5: 'closed', [standIn]: 'done' }), [], [{ id: proofIdFor(stored.date, 't2') }])
    expect(due.map((r) => r.taskId)).toEqual([standIn])
  })

  it('keeps two checks a day even when the stand-in was already done', () => {
    const allDone = Object.fromEntries(items.map((i) => [i.taskId, 'done']))
    const plan = withStatus({ ...allDone, t5: 'closed' })
    const due = proofRequestsDue(stored, plan, [], [{ id: proofIdFor(stored.date, 't2') }])
    expect(due).toHaveLength(1)
    expect(due[0].taskId).not.toBe('t5')
    // Nothing to stand in: every other task ended too.
    const none = withStatus(Object.fromEntries(items.map((i) => [i.taskId, i.taskId === 't2' ? 'done' : 'moved'])))
    expect(proofTasksFor(stored, none, new Set())).toEqual(new Set(['t2']))
  })

  it('lets a coordinator answer only their own requests; the leader reviews', () => {
    const requests = [{ id: 'p1', coordinatorId: 'coord-1' }]
    expect(proofRefusal('coordinator', 'coord-1', 'submitProof', ['p1'], requests)).toBeNull()
    expect(proofRefusal('coordinator', 'coord-2', 'submitProof', ['p1'], requests)).toMatch(/your own/)
    expect(proofRefusal('coordinator', 'coord-2', 'addProofRequest', [{ coordinatorId: 'coord-1' }], requests)).toMatch(/your own/)
    expect(proofRefusal('team_leader', 'admin-1', 'submitProof', ['p1'], requests)).toBeNull()
  })
})
