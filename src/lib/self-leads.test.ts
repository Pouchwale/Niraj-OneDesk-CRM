import { beforeEach, describe, expect, it } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import { leadsByPerson, leadSummary, weekEnd, weeklyByTeam, weekStart } from './self-leads'
import type { SelfLead, TeamModule } from './types'

function lead(overrides: Partial<SelfLead> = {}): SelfLead {
  return {
    id: 'l-1',
    date: '2026-11-03',
    coordinator_id: 'coord-1',
    company_name: 'Balaji Wafers',
    contact_person: null,
    contact_number: null,
    source: 'Cold call',
    connected: false,
    connected_date: null,
    status: 'open',
    value: null,
    lost_reason: null,
    remarks: [],
    created_at: '2026-11-03T10:00:00Z',
    created_by: 'coord-1',
    updated_at: '2026-11-03T10:00:00Z',
    updated_by: 'coord-1',
    ...overrides,
  }
}

describe('leadSummary', () => {
  it('counts connected, open, closed and lost, conversion over connected, and the two values', () => {
    const s = leadSummary([
      lead({ id: '1' }),
      lead({ id: '2', connected: true, value: 50000 }),
      lead({ id: '3', connected: true, status: 'closed', value: 120000 }),
      lead({ id: '4', connected: true, status: 'lost', value: 30000 }),
    ])
    expect(s).toEqual({ leads: 4, connected: 3, open: 2, closed: 1, lost: 1, conversion: 33, pipelineValue: 50000, valueWon: 120000 })
    expect(leadSummary([lead()]).conversion).toBeNull()
  })
})

describe('weeks and teams', () => {
  it('puts a day in its Monday-to-Sunday week', () => {
    expect(weekStart('2026-11-05')).toBe('2026-11-02')
    expect(weekStart('2026-11-02')).toBe('2026-11-02')
    expect(weekStart('2026-11-08')).toBe('2026-11-02')
    expect(weekEnd('2026-11-02')).toBe('2026-11-08')
  })

  it('splits each week by team, newest week first, with a total', () => {
    const teams: Record<string, TeamModule> = { 'coord-1': 'GP3', 'coord-9': 'Pouchwale' }
    const weeks = weeklyByTeam(
      [
        lead({ id: 'a', date: '2026-11-03', coordinator_id: 'coord-1', status: 'closed', connected: true, value: 1000 }),
        lead({ id: 'b', date: '2026-11-04', coordinator_id: 'coord-9' }),
        lead({ id: 'c', date: '2026-10-28', coordinator_id: 'coord-9' }),
      ],
      (id) => (id ? teams[id] ?? null : null)
    )
    expect(weeks.map((w) => w.week)).toEqual(['2026-11-02', '2026-10-26'])
    expect(weeks[0].teams.GP3).toMatchObject({ leads: 1, closed: 1, valueWon: 1000 })
    expect(weeks[0].teams.Pouchwale.leads).toBe(1)
    expect(weeks[0].total.leads).toBe(2)
  })

  it('gives everyone listed a line, at zero when they added nothing', () => {
    const rows = leadsByPerson([lead({ coordinator_id: 'coord-1', status: 'closed', value: 5 })], ['coord-1', 'coord-2'])
    expect(rows.map((r) => [r.personId, r.summary.leads])).toEqual([
      ['coord-1', 1],
      ['coord-2', 0],
    ])
  })
})

describe('saving a lead', () => {
  beforeEach(() => {
    demoCompanyStore.selfLeads = []
  })

  it('keeps its remarks and who added it when edited, and adds remarks in order', () => {
    demoCompanyStore.saveSelfLead(lead({ remarks: [{ at: '2026-11-03T10:00:00Z', by: 'coord-1', note: 'Asked for samples' }] }))
    demoCompanyStore.addSelfLeadRemark('l-1', { at: '2026-11-04T10:00:00Z', by: 'coord-1', note: 'Samples sent' })
    demoCompanyStore.saveSelfLead(lead({ status: 'closed', value: 90000, remarks: [], created_by: 'someone-else' }))
    const [saved] = demoCompanyStore.getSelfLeads()
    expect(saved).toMatchObject({ status: 'closed', value: 90000, created_by: 'coord-1' })
    expect(saved.remarks.map((r) => r.note)).toEqual(['Asked for samples', 'Samples sent'])
  })
})
