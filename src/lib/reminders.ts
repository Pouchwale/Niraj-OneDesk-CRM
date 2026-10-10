/**
 * Messages one person sends another.
 *
 * Every other notification in this app is *derived* - recomputed from invoices,
 * follow-ups and balances each time the bell is opened. A message from the team
 * leader to a coordinator is the one thing that cannot be derived from
 * anything: somebody decided to say it. So it is stored.
 *
 * Stored on the server, in the shared working dataset. It used to be kept in
 * the sender's own browser, so Robi said "Sent to 11 coordinators" and not one
 * of them - each on their own computer - ever saw it.
 *
 * One message to the whole team is stored as one row per person - each of them
 * has their own bell and their own read mark - tied together by a batch id so
 * the sender sees "sent to 11 coordinators" rather than eleven identical lines.
 */

import type { DirectedReminder } from './types'
import { demoCompanyStore } from './demo-companies'
import { whenSaved } from './shared-data'

export type { DirectedReminder }

function load(): DirectedReminder[] {
  return demoCompanyStore.getDirectedMessages()
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export interface SendReminderInput {
  fromUserId: string
  fromName: string
  toCoordinatorId: string
  subject?: string | null
  message: string
  link?: string | null
  audience?: string | null
}

export async function sendReminder(input: SendReminderInput): Promise<DirectedReminder> {
  const [sent] = await sendReminders({ ...input, to: [{ id: input.toCoordinatorId, name: '' }] })
  return sent
}

export interface Recipient {
  id: string
  name: string
}

export interface SendManyInput {
  fromUserId: string
  fromName: string
  to: Recipient[]
  subject?: string | null
  message: string
  link?: string | null
  audience?: string | null
}

/**
 * Sends one message to everybody named, as one batch.
 *
 * Nobody is written twice even if the same person is named twice, and a send
 * with no recipients is refused rather than silently doing nothing: "sent" has
 * to mean somebody will see it.
 */
export async function sendReminders(input: SendManyInput): Promise<DirectedReminder[]> {
  const unique = input.to.filter(
    (person, index, all) => person.id && all.findIndex((other) => other.id === person.id) === index
  )
  if (unique.length === 0) throw new Error('No one to send that to.')

  const batchId = id('batch')
  const createdAt = new Date().toISOString()
  const reminders: DirectedReminder[] = unique.map((person) => ({
    id: id('rem'),
    batchId,
    fromUserId: input.fromUserId,
    fromName: input.fromName,
    toCoordinatorId: person.id,
    subject: input.subject ?? null,
    message: input.message,
    link: input.link ?? null,
    audience: input.audience ?? null,
    createdAt,
  }))

  demoCompanyStore.addDirectedMessages(reminders)
  // "Sent" has to mean the server has it: a refusal or a dropped connection
  // throws here, and the person is told instead of being assured.
  await whenSaved()
  return reminders
}

/** Synchronous read used by the notification builder. */
export function readRemindersFor(coordinatorId: string): DirectedReminder[] {
  return load()
    .filter((reminder) => reminder.toCoordinatorId === coordinatorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Synchronous read used when the sender asks what they have sent. */
export function readRemindersFrom(userId: string): DirectedReminder[] {
  return load()
    .filter((reminder) => reminder.fromUserId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface SentMessage {
  batchId: string
  message: string
  subject: string | null
  audience: string | null
  createdAt: string
  /** Ids of everyone it went to. */
  recipientIds: string[]
}

/**
 * What one person has sent, with a broadcast counted once.
 *
 * The sender thinks in messages, not in deliveries: "I told the team on
 * Tuesday" is one thing they did, however many bells it rang.
 */
export function sentMessages(userId: string): SentMessage[] {
  const byBatch = new Map<string, SentMessage>()

  for (const reminder of readRemindersFrom(userId)) {
    const key = reminder.batchId ?? reminder.id
    const existing = byBatch.get(key)
    if (existing) {
      existing.recipientIds.push(reminder.toCoordinatorId)
      continue
    }
    byBatch.set(key, {
      batchId: key,
      message: reminder.message,
      subject: reminder.subject,
      audience: reminder.audience ?? null,
      createdAt: reminder.createdAt,
      recipientIds: [reminder.toCoordinatorId],
    })
  }

  return [...byBatch.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
