import { beforeEach, describe, expect, it } from 'vitest'
import {
  computeEntryStatus,
  getSettings,
  resetSettings,
  subscribeToSettings,
  updateSettings,
} from './admin-settings'

beforeEach(() => {
  resetSettings()
})

describe('the red-status rule reads the saved threshold', () => {
  it('turns red at the default threshold of five', () => {
    expect(computeEntryStatus({ orders_received: 0, pending_work: 5 })).toBe('red')
    expect(computeEntryStatus({ orders_received: 0, pending_work: 4 })).toBe('green')
  })

  it('moves with the setting rather than a number hardcoded elsewhere', () => {
    // The Settings page used to confirm this change and apply nothing.
    updateSettings({ red_status_pending_threshold: 9 })
    expect(computeEntryStatus({ orders_received: 0, pending_work: 5 })).toBe('green')
    expect(computeEntryStatus({ orders_received: 0, pending_work: 9 })).toBe('red')
  })

  it('never goes red when orders came in', () => {
    expect(computeEntryStatus({ orders_received: 2, pending_work: 40 })).toBe('green')
  })

  it('leave beats everything', () => {
    expect(computeEntryStatus({ is_leave: true, orders_received: 0, pending_work: 40 })).toBe('leave')
  })
})

describe('settings persistence', () => {
  it('keeps unrelated settings when one is updated', () => {
    updateSettings({ red_status_pending_threshold: 7 })
    expect(getSettings().delay_bucket_boundaries).toEqual([3, 7, 10])
  })

  it('tells subscribers when something changes', () => {
    let calls = 0
    const stop = subscribeToSettings(() => calls++)
    updateSettings({ allow_admin_edit: false })
    stop()
    updateSettings({ allow_admin_edit: true })
    expect(calls).toBe(1)
  })
})
