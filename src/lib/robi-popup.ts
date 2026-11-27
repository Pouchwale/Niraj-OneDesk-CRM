/**
 * Robi's pop-up in the middle of the screen (27 Nov 2026, the user's request).
 *
 * What goes in it, from the bell's own notifications (notifications.ts):
 *  - a message someone sent this person (the administrator or the team
 *    leader, through Robi), right away when it arrives, or the next time
 *    they open the CRM; each one once;
 *  - once a day, at the first look at the CRM that day: the payments falling
 *    due (today, and in three days) that are still unread in the bell.
 *  - customer updates (27 Nov 2026): the coordinator's open jobs to tell the
 *    customer about (shared/open-jobs.ts), right away when one becomes due
 *    or its RFD date changes, and every morning until the customer is told.
 * "Got it" marks everything shown as read; it stays in the bell to read again.
 * Old unread messages (over MESSAGE_DAYS) are left to the bell rather than
 * popping up weeks later. Pure: no React, no storage.
 */

import { updateKey, type CustomerUpdate } from '../../shared/open-jobs'
import type { AppNotification } from './notifications'

/** Messages older than this are not popped up, only kept in the bell. */
export const MESSAGE_DAYS = 7

export interface RobiPopupContent {
  messages: AppNotification[]
  /** Due-payment notifications, on the first pop-up of the day only. */
  due: AppNotification[]
  /** Whether this is the day's first pop-up (the morning greeting). */
  morning: boolean
  /** Customers to tell about their order: every one in the morning, else the ones not shown yet. */
  updates: CustomerUpdate[]
}

export const isMessage = (n: AppNotification) => n.id.startsWith('reminder-')
export const isDue = (n: AppNotification) => n.id.startsWith('notif-due-')

/**
 * What the pop-up shows now, or null when there is nothing to show.
 * `morningShownOn` is the day (yyyy-mm-dd) the person last closed a morning pop-up.
 */
export function robiPopupContent(
  notifications: AppNotification[],
  today: string,
  now: Date,
  morningShownOn: string | null,
  /** The person's customer updates waiting now (due, not told). */
  pending: readonly CustomerUpdate[] = [],
  /** Updates already shown (updateKey: PO and RFD date). */
  shownUpdates: ReadonlySet<string> = new Set()
): RobiPopupContent | null {
  const since = now.getTime() - MESSAGE_DAYS * 24 * 60 * 60 * 1000
  const messages = notifications
    .filter((n) => isMessage(n) && !n.read && new Date(n.createdAt).getTime() >= since)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const morning = morningShownOn !== today
  const due = morning ? notifications.filter((n) => isDue(n) && !n.read) : []
  // Every morning all of them, until the customer is told; during the day only the ones not shown yet.
  const updates = morning ? [...pending] : pending.filter((u) => !shownUpdates.has(updateKey(u)))
  if (messages.length === 0 && due.length === 0 && updates.length === 0) return null
  return { messages, due, morning, updates }
}

/** "Good morning" / "Good afternoon" / "Good evening" by the hour. */
export function greetingFor(now: Date): string {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
