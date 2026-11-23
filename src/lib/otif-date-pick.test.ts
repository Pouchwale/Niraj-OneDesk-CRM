import { describe, expect, it } from 'vitest'
import { pickRangeDay } from './otif-live'

const october = { from: '2026-10-01', to: '2026-10-31' }
const november = { from: '2026-11-01', to: '2026-11-23' }
const today = '2026-11-23'

describe('choosing OTIF dates', () => {
  it('lets November be chosen when October is remembered: To moves to today', () => {
    expect(pickRangeDay(october, 'from', '2026-11-01', today)).toEqual(november)
  })

  it('moves To to the month end for a finished month', () => {
    expect(pickRangeDay({ from: '2026-08-01', to: '2026-08-31' }, 'from', '2026-10-05', today)).toEqual({ from: '2026-10-05', to: '2026-10-31' })
  })

  it('lets an earlier month be chosen from the To box: From moves to its first day', () => {
    expect(pickRangeDay(november, 'to', '2026-10-31', today)).toEqual(october)
  })

  it('leaves the other date alone when the range is still in order', () => {
    expect(pickRangeDay(november, 'from', '2026-11-10', today)).toEqual({ from: '2026-11-10', to: '2026-11-23' })
    expect(pickRangeDay(november, 'to', '2026-11-10', today)).toEqual({ from: '2026-11-01', to: '2026-11-10' })
  })

  it('does not drag the other date while a year is half typed', () => {
    expect(pickRangeDay(november, 'to', '0202-11-23', today)).toEqual({ from: '2026-11-01', to: '0202-11-23' })
  })
})
