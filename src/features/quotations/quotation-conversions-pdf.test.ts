import { describe, expect, it } from 'vitest'

import type { ConversionSummary } from '@/lib/quotation-stats'
import { conversionCells, conversionTiles, pdfText, renderConversionsPdf } from './quotation-conversions-pdf'

const summary: ConversionSummary = {
  quotations: 729,
  newQuotations: 237,
  existingQuotations: 489,
  conversions: 264,
  newConversions: 39,
  existingConversions: 225,
  conversionRate: 36,
  amount: 12759891,
  score: 15100,
  customers: 355,
  averageScore: 42.54,
}

describe('conversions PDF', () => {
  it('writes a line in the same columns as the screen, with the full amount', () => {
    expect(conversionCells('Team', summary)).toEqual(['Team', '729', '264', '39', '225', 'Rs 1,27,59,891', '15,100', '355', '-57.46'])
  })

  it('shows a dash for no amount and no score', () => {
    const cells = conversionCells('Krupa', { ...summary, amount: 0, averageScore: null })
    expect(cells[5]).toBe('-')
    expect(cells[8]).toBe('-')
  })

  it('keeps the three tiles and their splits', () => {
    const [made, won, score] = conversionTiles(summary)
    expect(made.split).toEqual([['New', '237'], ['Existing', '489']])
    expect(won.hint).toContain('36% of quotations')
    expect(won.hint).toContain('Rs 1,27,59,891 total amount')
    expect(score.total).toBe('-57.46')
    expect(score.split).toEqual([['Total points', '15,100'], ['Count of customer', '355']])
  })

  it('runs onto more pages when the team is long', async () => {
    const people = Array.from({ length: 45 }, (_, i) => ({ name: `Person ${i + 1}`, summary }))
    const doc = await renderConversionsPdf({ period: 'All dates', who: 'Whole team', filters: [], team: summary, people, generatedBy: 'Test', today: '2026-11-23' })
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it('leaves no character the PDF font cannot draw', () => {
    expect(pdfText('1 Nov 2026 – 23 Nov 2026 · Value over ₹1.5L — x')).toBe('1 Nov 2026 - 23 Nov 2026 · Value over Rs 1.5L - x')
  })
})
