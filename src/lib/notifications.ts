import { demoCompanyStore } from './demo-companies';
import type { Company } from './types';
import { formatCurrency, formatDate, todayISO } from './utils';
import { daysUntilDue } from './due-filter';
import { readRemindersFor, type DirectedReminder } from './reminders';
import { isSetAside } from './no-followup';
import { worthChasing } from './status-rules';

/**
 * The notification bell.
 *
 * It carries one derived alert and nothing else: an Active Payments account
 * reaching its due date. A bell that also announced every ageing balance,
 * every broken promise and every scheduled reminder said something about
 * almost every account every day, which is the same as saying nothing.
 *
 * Two moments per account, and only two: a warning three days out, and a
 * reminder on the day itself. Anything already past its date is not announced
 * here; the Overdue screen and the "Critical & closing in" window are where
 * late money is worked.
 */

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  linkUrl?: string;
  createdAt: string;
  read: boolean;
  /** Groups notifications in the bell so the urgent ones sort first. */
  priority: number;
}

const PRIORITY = {
  // A colleague asked for this by hand, so it outranks anything the system
  // worked out for itself.
  directed: -1,
  dueToday: 0,
  dueSoon: 1,
} as const;

/** The days before a due date that earn a notification, and the day itself. */
export const DUE_WARNING_DAYS = 3;

/** Locally persisted read state, keyed per user. Notifications are derived, not stored. */
const READ_STORAGE_KEY = 'crm.notifications.read';

function getReadIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${READ_STORAGE_KEY}.${userId}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistReadIds(userId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(`${READ_STORAGE_KEY}.${userId}`, JSON.stringify([...ids]));
  } catch {
    // Storage can be unavailable (private mode); read state is a convenience only.
  }
}

/* ===================== Builders ===================== */

/**
 * The accounts falling due: three days out, and on the day.
 *
 * The id carries the due date, so an account whose date is corrected raises a
 * fresh notification rather than staying hidden behind an old "read" mark.
 */
export function buildDueNotifications(companies: Company[], now: string): AppNotification[] {
  const notifications: AppNotification[] = [];
  const today = todayISO();

  for (const company of companies) {
    if (company.status === 'paid' || isSetAside(company) || !company.due_date) continue;
    // A few paise is not worth waking somebody up for.
    if (!worthChasing(company.total_amount)) continue;

    const days = daysUntilDue(company.due_date, today);
    if (days !== 0 && days !== DUE_WARNING_DAYS) continue;

    const amount = formatCurrency(company.total_amount);
    const dueToday = days === 0;

    notifications.push({
      id: `notif-due-${company.id}-${company.due_date}-${days}`,
      title: dueToday ? 'Payment due today' : `Payment due in ${DUE_WARNING_DAYS} days`,
      message: dueToday
        ? `${company.name} owes ${amount}, due today. Call before the day ends.`
        : `${company.name} owes ${amount}, due on ${formatDate(company.due_date)}. A call now keeps it off the overdue list.`,
      type: dueToday ? 'warning' : 'info',
      linkUrl: `/companies?company=${company.id}`,
      createdAt: now,
      read: false,
      priority: dueToday ? PRIORITY.dueToday : PRIORITY.dueSoon,
    });
  }

  return notifications;
}

/* ===================== Public API ===================== */

export async function getNotifications(userId: string, isAdmin: boolean): Promise<AppNotification[]> {
  const now = new Date().toISOString();
  const companies: Company[] = isAdmin
    ? demoCompanyStore.getAllCompanies()
    : demoCompanyStore.getCompaniesForCoordinator(userId);

  // Reminders someone sent this coordinator directly. Not derived from
  // anything: a person decided to say it, so it is always delivered.
  const notifications = [
    ...buildDueNotifications(companies, now),
    ...buildReminderNotifications(readRemindersFor(userId)),
  ];

  const readIds = getReadIds(userId);
  notifications.forEach((n) => {
    n.read = readIds.has(n.id);
  });

  // Most urgent first, then most recent within a priority band.
  return notifications.sort(
    (a, b) =>
      a.priority - b.priority ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  const ids = getReadIds(userId);
  ids.add(notificationId);
  persistReadIds(userId, ids);
}

export async function markAllAsRead(notificationIds: string[], userId: string): Promise<void> {
  const ids = getReadIds(userId);
  notificationIds.forEach((id) => ids.add(id));
  persistReadIds(userId, ids);
}

/**
 * Turns a person-to-person message into a bell notification.
 *
 * Named explicitly - "Message from Niki Patel" - because the whole point is
 * that a colleague said it, not the system. An unattributed nudge reads as more
 * automated noise and gets dismissed like the rest. When the message named an
 * account it opens that account, so acting on it is one tap rather than a
 * search.
 */
function buildReminderNotifications(reminders: DirectedReminder[]): AppNotification[] {
  return reminders.map((reminder) => ({
    id: `reminder-${reminder.id}`,
    title: `Message from ${reminder.fromName}`,
    message: reminder.subject
      ? `${reminder.subject} — ${reminder.message}`
      : reminder.message,
    type: 'warning' as const,
    linkUrl: reminder.link ?? '/companies',
    createdAt: reminder.createdAt,
    read: false,
    priority: PRIORITY.directed,
  }));
}
