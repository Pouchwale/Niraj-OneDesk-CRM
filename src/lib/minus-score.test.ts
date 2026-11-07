import { describe, expect, it } from 'vitest'

import { lessHundred, scoreSweep } from './__fixtures__/less-hundred'
import { decimalsOf, minusExact, minusFixed, minusOneDecimal, minusScore, minusText } from './minus-score'

const sweep = scoreSweep()

describe('lessHundred (the tests’ own check, on digits)', () => {
  it('takes 100 off the written figure', () => {
    expect(lessHundred('70')).toBe('-30')
    expect(lessHundred('62.5')).toBe('-37.5')
    expect(lessHundred('100')).toBe('0')
    expect(lessHundred('100.0')).toBe('0.0')
    expect(lessHundred('150.00')).toBe('+50.00')
    expect(lessHundred('-25')).toBe('-125')
    expect(lessHundred('99.99')).toBe('-0.01')
    expect(lessHundred('33.33%')).toBe('-66.67%')
    expect(lessHundred('0')).toBe('-100')
    expect(lessHundred('0.0')).toBe('-100.0')
  })
})

describe('minusScore', () => {
  it('is the gap from 100', () => {
    expect(minusScore(70)).toBe(-30)
    expect(minusScore(100)).toBe(0)
    expect(minusScore(0)).toBe(-100)
    expect(minusScore(50)).toBe(-50)
    expect(minusScore(-25)).toBe(-125)
    expect(minusScore(-50)).toBe(-150)
    expect(minusScore(-100)).toBe(-200)
    expect(minusScore(150)).toBe(50)
    expect(minusScore(62.5, 1)).toBe(-37.5)
    expect(minusScore(33.3, 1)).toBe(-66.7)
    expect(minusScore(66.67, 2)).toBe(-33.33)
    expect(minusScore(85.55, 2)).toBe(-14.45)
  })

  it('never gives -0', () => {
    expect(Object.is(minusScore(100), 0)).toBe(true)
    expect(Object.is(minusScore(100, 2), 0)).toBe(true)
  })

  it('leaves no floating-point error: the number is exactly the shown score less 100', () => {
    for (const v of sweep) {
      for (const d of [0, 1, 2]) {
        const shown = Number(v.toFixed(d))
        expect(minusScore(shown, d)).toBe(Number(lessHundred(String(shown))))
      }
    }
  })
})

describe('minusText', () => {
  it('writes the sign of a score above full marks', () => {
    expect(minusText(-30)).toBe('-30')
    expect(minusText(0)).toBe('0')
    expect(minusText(50)).toBe('+50')
    expect(minusText(-37.5, 2, true)).toBe('-37.50')
    expect(minusText(0, 2, true)).toBe('0.00')
    expect(minusText(12.5, 1, true)).toBe('+12.5')
  })
})

describe('decimalsOf', () => {
  it('counts the written decimals', () => {
    expect(decimalsOf(70)).toBe(0)
    expect(decimalsOf(62.5)).toBe(1)
    expect(decimalsOf(33.33)).toBe(2)
    expect(decimalsOf(-0.125)).toBe(3)
  })
})

describe('each minus figure is exactly the old figure less 100', () => {
  it('fixed decimals (toFixed, as Quotations, Service and the final score were shown)', () => {
    for (const v of sweep) {
      for (const d of [1, 2]) expect(minusFixed(v, d)).toBe(lessHundred(v.toFixed(d)))
    }
  })

  it('one decimal (Math.round, as Billing and Service were shown on the Final score page)', () => {
    for (const v of sweep) expect(minusOneDecimal(v)).toBe(lessHundred(String(Math.round(v * 10) / 10)))
  })

  it('as it is (Self Leads conversion)', () => {
    for (const v of sweep) {
      const old = String(Math.round(v * 100) / 100)
      expect(minusExact(Number(old))).toBe(lessHundred(old))
    }
  })

  it('shows a dash with no score', () => {
    expect(minusFixed(null, 2)).toBe('—')
    expect(minusOneDecimal(undefined)).toBe('—')
    expect(minusExact(null)).toBe('—')
    expect(minusFixed(Number.NaN, 1)).toBe('—')
  })
})
