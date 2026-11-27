import { describe, expect, it } from 'vitest'

import type { AppNotification } from './notifications'
import { greetingFor, robiPopupContent } from './robi-popup'

const NOW = new Date('2026-11-27T09:30:00+05:30')
const TODAY = '2026-11-27'
const note = (id: string, o: Partial<AppNotification> = {}): AppNotification => ({
  id, title: id, message: id, type: 'info', createdAt: '2026-11-27T03:00:00.000Z', read: false, priority: 0, ...o,
})

describe('Robi pop-up', () => {
  const message = note('reminder-r1', { title: 'Message from Niki Patel' })
  const dueToday = note('notif-due-c1-2026-11-27-0', { title: 'Payment due today' })

  it('shows a new message, and the due payments at the first look of the day', () => {
    const c = robiPopupContent([message, dueToday], TODAY, NOW, null)!
    expect(c.messages.map((n) => n.id)).toEqual(['reminder-r1'])
    expect(c.due.map((n) => n.id)).toEqual([dueToday.id])
    expect(c.morning).toBe(true)
  })

  it('after the morning one, only new messages pop up that day', () => {
    const later = note('reminder-r2', { createdAt: '2026-11-27T06:00:00.000Z' })
    const c = robiPopupContent([later, dueToday], TODAY, NOW, TODAY)!
    expect(c.messages.map((n) => n.id)).toEqual(['reminder-r2'])
    expect(c.due).toEqual([])
    expect(c.morning).toBe(false)
    // Nothing new: no pop-up.
    expect(robiPopupContent([dueToday], TODAY, NOW, TODAY)).toBeNull()
  })

  it('pops each message once: read in the bell, it is not shown again', () => {
    expect(robiPopupContent([{ ...message, read: true }], TODAY, NOW, TODAY)).toBeNull()
  })

  it('leaves old unread messages to the bell', () => {
    const old = note('reminder-old', { createdAt: '2026-11-10T03:00:00.000Z' })
    expect(robiPopupContent([old], TODAY, NOW, TODAY)).toBeNull()
  })

  it('has nothing to say on a morning with nothing new', () => {
    expect(robiPopupContent([], TODAY, NOW, null)).toBeNull()
    expect(robiPopupContent([{ ...dueToday, read: true }], TODAY, NOW, null)).toBeNull()
  })

  it('greets by the time of day', () => {
    expect(greetingFor(new Date(2026, 10, 27, 9))).toBe('Good morning')
    expect(greetingFor(new Date(2026, 10, 27, 14))).toBe('Good afternoon')
    expect(greetingFor(new Date(2026, 10, 27, 19))).toBe('Good evening')
  })
})
