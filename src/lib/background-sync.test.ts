import { describe, expect, it } from 'vitest'
import { booksToSync } from './background-sync'

describe('background Excel sync (28 Nov 2026)', () => {
  const status = {
    companies: { configured: true, exists: true, modifiedAt: 'A2' },
    overdue: { configured: true, exists: true, modifiedAt: 'A2' },
    rfd: { configured: true, exists: true, modifiedAt: 'R5' },
    otif: { configured: true, exists: true, modifiedAt: 'O1' },
  }
  it('imports every book saved since its last import, RFD included; never OTIF', () => {
    const last: Record<string, string | null> = { companies: 'A2', overdue: 'A1', rfd: 'R1' }
    expect(booksToSync(status, (b) => last[b] ?? null)).toEqual(['overdue', 'rfd'])
  })
  it('leaves a book with no file connected or missing', () => {
    expect(booksToSync({ ...status, rfd: { configured: false, exists: false, modifiedAt: null } }, () => null)).toEqual(['companies', 'overdue'])
  })
})
