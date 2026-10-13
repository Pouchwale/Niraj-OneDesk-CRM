import type { FollowupEntityType } from '../../lib/types'

/**
 * The nudges the assistant can raise. Ordered roughly by how much they cost the
 * business if ignored; `priority` below encodes that explicitly.
 */
export type AssistantTaskKind =
  | 'yesterday_recap'
  | 'commitment_due_today'
  | 'commitment_broken'
  | 'proof_required'
  | 'reminder_due'
  /** Balance ageing past 90 days that is still being chased too slowly. */
  | 'overdue_ageing'
  | 'overdue_untouched'
  | 'payment_due_soon'
  | 'stale_contact'
  /**
   * An overdue account handed out once the day's Active Payments tasks are
   * done. Never raised as a nudge; only the plan adds these.
   */
  | 'overdue_followup'
  /** Money past 120 days held up by a credit or debit note (note-pending.ts). */
  | 'note_pending'

/**
 * What the coordinator can do with a nudge. Deliberately nothing that writes a
 * follow-up: the robot points at the record, and the details are logged on
 * the account's own timeline, by the person, in their own words.
 */
export type AssistantIntent = 'open' | 'snooze' | 'dismiss'

export interface AssistantAction {
  intent: AssistantIntent
  label: string
  tone?: 'primary' | 'default' | 'destructive'
}

export interface AssistantTask {
  /**
   * Stable across reloads so a snoozed or answered nudge stays quiet. Derived
   * from the kind plus the record it concerns, never from array position.
   */
  id: string
  kind: AssistantTaskKind
  priority: number
  /** What the assistant says, in the first person. */
  message: string
  detail?: string
  entityType?: FollowupEntityType
  entityId?: string
  entityName?: string
  amount?: number | null
  /** Set when the nudge is about an existing follow-up (e.g. proof chasing). */
  followupId?: string
  actions: AssistantAction[]
}

/** Priority bands; lower sorts first. */
export const TASK_PRIORITY: Record<AssistantTaskKind, number> = {
  yesterday_recap: 0,
  commitment_due_today: 1,
  commitment_broken: 2,
  // Money ageing past 90 days outranks paperwork: it is the balance most
  // likely to become a write-off if nobody moves on it.
  overdue_ageing: 3,
  proof_required: 4,
  reminder_due: 5,
  overdue_untouched: 6,
  payment_due_soon: 7,
  stale_contact: 8,
  overdue_followup: 9,
  note_pending: 0,
}

/** A single turn in the on-screen conversation. */
export interface AssistantMessage {
  id: string
  from: 'assistant' | 'coordinator'
  text: string
  detail?: string
  /** Present when the assistant is waiting on an answer for this task. */
  task?: AssistantTask
  at: string
  /** Things to ask or do next, shown as buttons under the reply. */
  suggestions?: string[]
  /**
   * A message to the team waiting for the sender to press Send. Nothing goes
   * out until they do; `sendState` records what happened to it.
   */
  draft?: {
    recipients: { id: string; name: string }[]
    audience: string
    subject: string | null
    message: string
    link?: string | null
  }
  sendState?: 'sending' | 'sent' | 'cancelled' | 'failed'
}
