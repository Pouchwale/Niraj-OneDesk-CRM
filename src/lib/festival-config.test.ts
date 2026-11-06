/**
 * The administrator's festival settings: cleaned on every save, kept in the
 * shared store, and changed by the administrator only.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import { cleanFestivalConfig, DEFAULT_FESTIVAL_CONFIG, isDay } from './festival-config'
import { festivalConfigRefusal, mayCall } from '../../server/modules/data/operations'

describe('cleaning the festival settings', () => {
  it('falls back to the defaults for anything missing or wrong', () => {
    expect(cleanFestivalConfig(null)).toEqual(DEFAULT_FESTIVAL_CONFIG)
    const c = cleanFestivalConfig({ enabled: 'yes', durationSec: 999, countdownDays: -4, intensity: 'loud', festivals: 'x', custom: 'y' })
    expect(c.enabled).toBe(true)
    expect(c.durationSec).toBe(60)
    expect(c.countdownDays).toBe(0)
    expect(c.intensity).toBe('normal')
    expect(c.festivals).toEqual({})
    expect(c.custom).toEqual([])
  })

  it('keeps only real dates filed under their own year', () => {
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2028-02-29')).toBe(true)
    const c = cleanFestivalConfig({
      festivals: {
        holi: { enabled: false, dates: { '2027': { start: '2027-03-23' }, '2028': { start: '2027-03-11' }, '2029': { start: '2029-02-30' } } },
        navratri: { dates: { '2029': { start: '2029-10-09', end: '2029-10-17' } }, colours: ['Red', 5, 'Blue'] },
        'Bad Id!': { enabled: false },
      },
    })
    expect(c.festivals.holi).toEqual({ enabled: false, dates: { '2027': { start: '2027-03-23' } } })
    expect(c.festivals.navratri).toEqual({ dates: { '2029': { start: '2029-10-09', end: '2029-10-17' } }, colours: ['Red', '', 'Blue'] })
    expect(c.festivals['Bad Id!']).toBeUndefined()
  })

  it('drops an end before the start or more than 15 days on', () => {
    const c = cleanFestivalConfig({ festivals: { navratri: { dates: { '2029': { start: '2029-10-09', end: '2029-12-01' } } } } })
    expect(c.festivals.navratri?.dates?.['2029']).toEqual({ start: '2029-10-09' })
  })

  it('keeps sound company celebrations and drops broken ones', () => {
    const c = cleanFestivalConfig({
      custom: [
        { id: 'founding', name: '  Foundation Day ', date: '2026-12-01', yearly: true, theme: 'diwali', emoji: '🏭', greeting: 'Thank you, team!', about: '', enabled: true, auto: false },
        { id: 'founding', name: 'Duplicate', date: '2026-12-02' },
        { id: 'x', name: '', date: '2026-12-01' },
        { id: 'y', name: 'Bad date', date: '2026-13-01' },
        { id: 'z', name: 'Odd look', date: '2026-12-03', theme: '<script>' },
      ],
    })
    expect(c.custom.map((x) => x.name)).toEqual(['Foundation Day', 'Odd look'])
    expect(c.custom[1].theme).toBe('celebration')
    expect(c.custom[0].auto).toBe(false)
  })
})

describe('the festival settings in the store', () => {
  beforeEach(() => demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), festivalConfig: null }))

  it('saves a cleaned copy and carries it in the snapshot', () => {
    expect(demoCompanyStore.getFestivalConfig()).toBeNull()
    demoCompanyStore.saveFestivalConfig({ ...DEFAULT_FESTIVAL_CONFIG, durationSec: 500, updatedBy: 'admin-0', updatedAt: '2026-11-06T05:00:00.000Z' })
    expect(demoCompanyStore.getFestivalConfig()?.durationSec).toBe(60)
    const snapshot = demoCompanyStore.getSnapshot()
    expect(snapshot.festivalConfig?.updatedBy).toBe('admin-0')
    demoCompanyStore.replaceAll({ ...snapshot, festivalConfig: { ...snapshot.festivalConfig!, autoCelebrate: false } })
    expect(demoCompanyStore.getFestivalConfig()?.autoCelebrate).toBe(false)
  })

  it('lets only the administrator change them', () => {
    expect(festivalConfigRefusal('admin', 'saveFestivalConfig')).toBeNull()
    expect(festivalConfigRefusal('team_leader', 'saveFestivalConfig')).toMatch(/administrator/)
    expect(festivalConfigRefusal('coordinator', 'saveFestivalConfig')).toMatch(/administrator/)
    expect(festivalConfigRefusal('coordinator', 'saveSelfLead')).toBeNull()
    expect(mayCall('coordinator', 'saveFestivalConfig')).toBe(false)
  })
})
