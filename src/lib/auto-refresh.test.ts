import { describe, expect, it } from 'vitest'
import { mainScriptOf, safeToReload } from './auto-refresh'
import { demoCompanyStore, NOTIFICATION_READS_KEPT } from './demo-companies'
import { notificationReadRefusal } from '../../server/modules/data/operations'

const doc = (active: Partial<HTMLElement> | null, dialog = false) =>
  ({ activeElement: active, querySelector: () => (dialog ? {} : null) }) as unknown as Document

describe('automatic refresh after a deploy (28 Nov 2026)', () => {
  it('reads the main script from index.html', () => {
    expect(mainScriptOf('<script type="module" crossorigin src="/assets/index-Bio2x2OM.js"></script>')).toBe('/assets/index-Bio2x2OM.js')
    expect(mainScriptOf('<html></html>')).toBeNull()
  })
  it('reloads only when nobody is typing and no dialog is open', () => {
    expect(safeToReload(doc({ tagName: 'BODY' }))).toBe(true)
    expect(safeToReload(doc({ tagName: 'INPUT' }))).toBe(false)
    expect(safeToReload(doc({ tagName: 'TEXTAREA' }))).toBe(false)
    expect(safeToReload(doc({ tagName: 'DIV', isContentEditable: true }))).toBe(false)
    expect(safeToReload(doc({ tagName: 'BODY' }, true))).toBe(false)
  })
})

describe('notifications read, kept on the server (28 Nov 2026)', () => {
  it('adds each person’s read marks once, keeps the newest, and only their own', () => {
    demoCompanyStore.notificationReads = []
    demoCompanyStore.markNotificationsRead('u1', ['a', 'b'])
    demoCompanyStore.markNotificationsRead('u1', ['b', 'c'])
    demoCompanyStore.markNotificationsRead('u2', ['x'])
    expect(demoCompanyStore.getNotificationReads('u1')).toEqual(['a', 'b', 'c'])
    expect(demoCompanyStore.getNotificationReads('u2')).toEqual(['x'])
    demoCompanyStore.markNotificationsRead('u1', Array.from({ length: NOTIFICATION_READS_KEPT + 5 }, (_, i) => `n${i}`))
    const kept = demoCompanyStore.getNotificationReads('u1')
    expect(kept).toHaveLength(NOTIFICATION_READS_KEPT)
    expect(kept[kept.length - 1]).toBe(`n${NOTIFICATION_READS_KEPT + 4}`)
    expect(notificationReadRefusal('u1', 'markNotificationsRead', ['u1', ['a']])).toBeNull()
    expect(notificationReadRefusal('u1', 'markNotificationsRead', ['u2', ['a']])).toMatch(/own/)
  })
})
