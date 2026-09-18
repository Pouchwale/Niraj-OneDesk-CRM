import { todayISO } from '@/lib/utils'

/**
 * Per-user record of which nudges have been answered or snoozed.
 *
 * Nudges are derived from live data rather than stored, so this is the only
 * thing that has to persist: without it the assistant would re-ask everything on
 * every page load. Snoozes are keyed to a date so they lapse the next day.
 */
interface AssistantState {
  /** taskId -> ISO date it was snoozed until (exclusive). */
  snoozed: Record<string, string>
  /** taskIds the coordinator has dealt with; cleared when the task changes id. */
  done: string[]
  /** ISO date the assistant last greeted this user, so it greets once a day. */
  lastGreeting?: string
}

const EMPTY: AssistantState = { snoozed: {}, done: [] }

/** Keeps the done-list from growing without bound on a long-lived account. */
const MAX_DONE = 500

function storageKey(userId: string): string {
  return `crm.assistant.${userId}`
}

export function loadAssistantState(userId: string): AssistantState {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return { ...EMPTY }

    const parsed = JSON.parse(raw) as Partial<AssistantState>
    return {
      snoozed: parsed.snoozed ?? {},
      done: parsed.done ?? [],
      lastGreeting: parsed.lastGreeting,
    }
  } catch {
    // Private mode or corrupted value: behave as a fresh assistant.
    return { ...EMPTY }
  }
}

export function saveAssistantState(userId: string, state: AssistantState): void {
  try {
    const trimmed: AssistantState = {
      ...state,
      done: state.done.slice(-MAX_DONE),
    }
    localStorage.setItem(storageKey(userId), JSON.stringify(trimmed))
  } catch {
    // Persistence is a convenience; never break the widget over it.
  }
}

/** True when a task should stay hidden today. */
export function isSuppressed(state: AssistantState, taskId: string): boolean {
  if (state.done.includes(taskId)) return true

  const until = state.snoozed[taskId]
  return !!until && until > todayISO()
}

export function markDone(userId: string, taskId: string): AssistantState {
  const state = loadAssistantState(userId)
  if (!state.done.includes(taskId)) state.done.push(taskId)
  delete state.snoozed[taskId]
  saveAssistantState(userId, state)
  return state
}

/** Hides a task until tomorrow. */
export function snooze(userId: string, taskId: string, days = 1): AssistantState {
  const state = loadAssistantState(userId)
  const until = new Date()
  until.setDate(until.getDate() + days)
  const y = until.getFullYear()
  const m = String(until.getMonth() + 1).padStart(2, '0')
  const d = String(until.getDate()).padStart(2, '0')

  state.snoozed[taskId] = `${y}-${m}-${d}`
  saveAssistantState(userId, state)
  return state
}

export function markGreeted(userId: string): void {
  const state = loadAssistantState(userId)
  state.lastGreeting = todayISO()
  saveAssistantState(userId, state)
}

export function greetedToday(userId: string): boolean {
  return loadAssistantState(userId).lastGreeting === todayISO()
}
