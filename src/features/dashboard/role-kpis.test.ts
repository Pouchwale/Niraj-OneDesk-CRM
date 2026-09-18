import { describe, expect, it } from 'vitest'
import { buildRoleKpis, kpiSectionTitle, type KpiSnapshot, type RoleKpi } from './role-kpis'
import type { Company, DailyEntry, OverduePayment, UserRole } from '@/lib/types'
import { toLocalISODate } from '@/lib/utils'

const TODAY = '2026-09-03'

/**
 * Offset from TODAY as a calendar date. Formatted locally rather than through
 * toISOString(), which converts to UTC first and so shifts the day backwards
 * for any timezone ahead of it.
 */
function day(offset: number): string {
  const date = new Date(`${TODAY}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return toLocalISODate(date)
}

function ageingRow(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'BP-9',
    customer_name: 'Zenith Papers',
    balance_due: 500000,
    due_0_30: 0,
    due_31_60: 500000,
    due_61_90: 0,
    due_91_120: 0,
    due_121_plus: 0,
    payment_terms: null,
    contact_person: null,
    contact_number: null,
    email: null,
    coordinator_name: 'Pragati',
    sales_person_name: null,
    department: null,
    account_type: null,
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: 'coord-1',
    status: 'overdue',
    extra_fields: {},
    imported_at: day(-1),
    created_at: day(-1),
    updated_at: day(-1),
    ...overrides,
  }
}

/** An Active Payments invoice: the record the coordinator's cards read. */
function companyRow(id: string, overrides: Partial<Company> = {}): Company {
  return {
    id,
    sap_bp_code: id.toUpperCase(),
    invoice_no: id,
    name: id,
    contact_person: null,
    contact_number: '',
    email: null,
    payment_terms: 'Net-30',
    total_amount: 100000,
    invoice_date: null,
    due_date: TODAY,
    status: 'overdue',
    assigned_coordinator_id: 'coord-1',
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: TODAY,
    updated_at: TODAY,
    ...overrides,
  }
}

function snapshot(role: UserRole, overrides: Partial<KpiSnapshot> = {}): KpiSnapshot {
  return {
    today: TODAY,
    userId: role === 'admin' ? 'admin-0' : role === 'team_leader' ? 'admin-1' : 'coord-1',
    role,
    commitments: [],
    companies: [],
    overduePayments: [],
    entries: [],
    coordinatorCount: 7,
    ...overrides,
  }
}

function byId(kpis: RoleKpi[], id: string): RoleKpi {
  const found = kpis.find((k) => k.id === id)
  if (!found) throw new Error(`No KPI "${id}" in [${kpis.map((k) => k.id).join(', ')}]`)
  return found
}

describe('role targeting', () => {
  it('gives each role a different set of KPIs', () => {
    const coordinator = buildRoleKpis(snapshot('coordinator')).map((k) => k.id)
    const leader = buildRoleKpis(snapshot('team_leader')).map((k) => k.id)
    const admin = buildRoleKpis(snapshot('admin')).map((k) => k.id)

    expect(new Set([...coordinator, ...leader, ...admin]).size).toBeGreaterThan(
      coordinator.length
    )
    expect(coordinator).not.toEqual(leader)
    // The one that was missing: the administrator owns the system, the leader
    // owns the book, and they were reading the same four cards.
    expect(admin).not.toEqual(leader)
  })

  it('sends each card to the page whose total it quotes', () => {
    /*
     * The whole promise of these cards is that the next screen shows the same
     * rows. The 90+ card once counted the ageing buckets and opened Active
     * Payments, where a different set of accounts was waiting.
     */
    const links: [UserRole, string, string][] = [
      ['coordinator', 'my-active-payments', '/companies'],
      ['coordinator', 'my-overdue-payments', '/overdue'],
      ['coordinator', 'my-critical-overdue', '/overdue?status=critical'],
      ['team_leader', 'active-payments', '/companies'],
      ['team_leader', 'overdue-payments', '/overdue'],
      ['team_leader', 'critical-overdue', '/overdue?status=critical'],
    ]
    for (const [role, id, href] of links) {
      expect(byId(buildRoleKpis(snapshot(role)), id).href, `${role}/${id}`).toBe(href)
    }
  })

  it('points every KPI at a page where it can be acted on', () => {
    for (const role of ['coordinator', 'team_leader', 'admin'] as UserRole[]) {
      for (const kpi of buildRoleKpis(snapshot(role))) {
        expect(kpi.href, `${role}/${kpi.id}`).toBeTruthy()
        expect(kpi.hint, `${role}/${kpi.id}`).not.toBe('')
      }
    }
  })

  it('never invents a trend without a real prior period', () => {
    // No allocation history at all, so no percentage may be shown.
    for (const role of ['coordinator', 'team_leader', 'admin'] as UserRole[]) {
      for (const kpi of buildRoleKpis(snapshot(role))) {
        expect(kpi.deltaPct, `${role}/${kpi.id}`).toBeUndefined()
      }
    }
  })
})

describe('coordinator KPIs', () => {
  /*
   * Four figures, and each one is the total on the page it links to: her
   * Active Payments book, her Overdue book, what her customers promised her,
   * and the 90+ part of her ageing. The two books stay separate on purpose —
   * they answer different questions, and every attempt to merge them produced
   * a headline that matched neither screen.
   */
  it('shows her the total the Active Payments page shows her', () => {
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        companies: [
          companyRow('c1', { total_amount: 100000 }),
          companyRow('c2', { total_amount: 250000 }),
          // Another coordinator's invoice, and a large one: it must not leak.
          companyRow('c3', { total_amount: 900000, assigned_coordinator_id: 'coord-9' }),
        ],
      })
    )
    expect(byId(kpis, 'my-active-payments').value).toBe('₹3.5L')
    expect(byId(kpis, 'my-active-payments').hint).toContain('2 invoices')
    expect(byId(kpis, 'my-active-payments').href).toBe('/companies')
  })

  it('leaves settled invoices out of the active payments book', () => {
    // The Active Payments working list drops them, so the card must too.
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        companies: [
          companyRow('c1', { total_amount: 100000 }),
          companyRow('c2', { total_amount: 400000, status: 'paid' }),
        ],
      })
    )
    expect(byId(kpis, 'my-active-payments').value).toBe('₹1L')
  })

  it('names how much of her active payments is already past due', () => {
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        companies: [
          companyRow('c1', { total_amount: 300000, status: 'overdue' }),
          companyRow('c2', { total_amount: 100000, status: 'critical' }),
          companyRow('c3', { total_amount: 600000, status: 'upcoming', due_date: day(20) }),
        ],
      })
    )
    expect(byId(kpis, 'my-active-payments').value).toBe('₹10L')
    expect(byId(kpis, 'my-active-payments').hint).toContain('₹4L of it past due')
  })

  it('shows her overdue book as the ageing report totals it', () => {
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        overduePayments: [
          ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 500000 }),
          ageingRow({ id: 'o2', bp_code: 'BP-8', balance_due: 320000 }),
          ageingRow({ id: 'o3', bp_code: 'BP-7', balance_due: 900000, assigned_coordinator_id: 'coord-9' }),
        ],
      })
    )
    expect(byId(kpis, 'my-overdue-payments').value).toBe('₹8.2L')
    expect(byId(kpis, 'my-overdue-payments').hint).toContain('2 accounts')
    expect(byId(kpis, 'my-overdue-payments').href).toBe('/overdue')
  })

  it('keeps the two books apart rather than adding them together', () => {
    /*
     * The same customer is in both files. Adding the two would double-count
     * it, and merging them into one headline produced a figure that matched
     * neither page — which is what made people stop trusting the dashboard.
     */
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        companies: [companyRow('c1', { sap_bp_code: 'BP-9', total_amount: 100000 })],
        overduePayments: [ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 500000 })],
      })
    )
    expect(byId(kpis, 'my-active-payments').value).toBe('₹1L')
    expect(byId(kpis, 'my-overdue-payments').value).toBe('₹5L')
  })

  it('totals what her customers have committed to pay', () => {
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        commitments: [
          { bp_code: 'BP-1', amount: 300000, committed_date: day(4), coordinator_id: 'coord-1' },
          { bp_code: 'BP-2', amount: 200000, committed_date: day(9), coordinator_id: 'coord-1' },
          // Another coordinator's promise is not hers to chase.
          { bp_code: 'BP-3', amount: 800000, committed_date: day(2), coordinator_id: 'coord-9' },
        ],
      })
    )
    expect(byId(kpis, 'my-commitments').value).toBe('₹5L')
    expect(byId(kpis, 'my-commitments').hint).toContain('2 promises')
    expect(byId(kpis, 'my-commitments').hint).toContain('none past its date yet')
  })

  it('separates the promises whose date has already passed', () => {
    // The actionable half: a date the customer gave that has come and gone.
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        commitments: [
          { bp_code: 'BP-1', amount: 300000, committed_date: day(-2), coordinator_id: 'coord-1' },
          { bp_code: 'BP-2', amount: 200000, committed_date: day(6), coordinator_id: 'coord-1' },
        ],
      })
    )
    const promises = byId(kpis, 'my-commitments')
    expect(promises.value).toBe('₹5L')
    expect(promises.hint).toContain('₹3L past the date given')
    expect(promises.tone).toBe('bad')
  })

  it('says plainly when no customer has committed to anything', () => {
    const kpis = buildRoleKpis(snapshot('coordinator', { commitments: [] }))
    expect(byId(kpis, 'my-commitments').value).toBe('₹0')
    expect(byId(kpis, 'my-commitments').hint).toBe('No customer of yours has committed to a date')
  })

  it('reads critical off the 90+ ageing buckets, not the whole balance', () => {
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        overduePayments: [
          ageingRow({ id: 'o1', balance_due: 500000, due_31_60: 200000, due_91_120: 300000 }),
          ageingRow({ id: 'o2', bp_code: 'BP-8', balance_due: 500000, due_0_30: 500000 }),
        ],
      })
    )
    const critical = byId(kpis, 'my-critical-overdue')
    // Only the 90+ portion of the first row, not either whole balance.
    expect(critical.value).toBe('₹3L')
    expect(critical.hint).toContain('1 account')
    // 3,00,000 of a 10,00,000 ageing book.
    expect(critical.hint).toContain('30% of your ageing book')
    expect(critical.tone).toBe('bad')
    expect(critical.href).toBe('/overdue?status=critical')
  })

  it('says so plainly when nothing of hers is past ninety days', () => {
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        overduePayments: [ageingRow({ id: 'o1', balance_due: 100000, due_0_30: 100000 })],
      })
    )
    expect(byId(kpis, 'my-critical-overdue').value).toBe('₹0')
    expect(byId(kpis, 'my-critical-overdue').tone).toBe('good')
  })

  it('leaves an account set aside out of every figure', () => {
    // Set aside means not chased and not counted; a card that still counts it
    // is the padding the decision was taken to remove.
    const kpis = buildRoleKpis(
      snapshot('coordinator', {
        companies: [
          companyRow('c1', { total_amount: 100000 }),
          companyRow('c2', { total_amount: 400000, no_followup_at: day(-1) }),
        ],
        overduePayments: [
          ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 250000, due_121_plus: 250000 }),
          ageingRow({
            id: 'o2',
            bp_code: 'BP-8',
            balance_due: 700000,
            due_121_plus: 700000,
            no_followup_at: day(-1),
          }),
        ],
      })
    )
    expect(byId(kpis, 'my-active-payments').value).toBe('₹1L')
    expect(byId(kpis, 'my-overdue-payments').value).toBe('₹2.5L')
    expect(byId(kpis, 'my-critical-overdue').value).toBe('₹2.5L')
  })
})

describe('team leader KPIs', () => {
  it('reports the whole book, not one coordinator\'s slice', () => {
    const kpis = buildRoleKpis(
      snapshot('team_leader', {
        companies: [
          companyRow('c1', { total_amount: 100000, assigned_coordinator_id: 'coord-1' }),
          companyRow('c2', { total_amount: 140000, assigned_coordinator_id: 'coord-2' }),
        ],
        overduePayments: [
          ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 500000, assigned_coordinator_id: 'coord-1' }),
          ageingRow({ id: 'o2', bp_code: 'BP-8', balance_due: 300000, assigned_coordinator_id: 'coord-5' }),
        ],
      })
    )
    expect(byId(kpis, 'active-payments').value).toBe('₹2.4L')
    expect(byId(kpis, 'overdue-payments').value).toBe('₹8L')
  })

  it('carries the same four figures the coordinator has', () => {
    /*
     * Deliberately the same measures at team scale: a leader and a coordinator
     * discussing one account should be reading the same kind of number, not
     * two different derivations that happen to be near each other.
     */
    const companies = [companyRow('c1', { sap_bp_code: 'BP-1', total_amount: 500000 })]
    const overduePayments = [
      ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 400000, due_121_plus: 400000 }),
    ]
    const commitments = [
      { bp_code: 'BP-1', amount: 250000, committed_date: day(3), coordinator_id: 'coord-1' },
    ]
    const leader = buildRoleKpis(snapshot('team_leader', { companies, overduePayments, commitments }))
    const coordinator = buildRoleKpis(
      snapshot('coordinator', { companies, overduePayments, commitments })
    )

    // Everything belongs to coord-1, so the two views must agree exactly.
    expect(byId(leader, 'active-payments').value).toBe(byId(coordinator, 'my-active-payments').value)
    expect(byId(leader, 'overdue-payments').value).toBe(byId(coordinator, 'my-overdue-payments').value)
    expect(byId(leader, 'team-commitments').value).toBe(byId(coordinator, 'my-commitments').value)
    expect(byId(leader, 'critical-overdue').value).toBe(byId(coordinator, 'my-critical-overdue').value)
  })

  it('totals what every client has committed, across the team', () => {
    const kpis = buildRoleKpis(
      snapshot('team_leader', {
        commitments: [
          { bp_code: 'BP-1', amount: 300000, committed_date: day(-1), coordinator_id: 'coord-1' },
          { bp_code: 'BP-2', amount: 200000, committed_date: day(5), coordinator_id: 'coord-9' },
        ],
      })
    )
    // Both coordinators' promises, unlike the coordinator's own card.
    expect(byId(kpis, 'team-commitments').value).toBe('₹5L')
    expect(byId(kpis, 'team-commitments').hint).toContain('₹3L past the date given')
  })

  it('shows the team what has gone past ninety days', () => {
    const kpis = buildRoleKpis(
      snapshot('team_leader', {
        overduePayments: [
          ageingRow({ id: 'o1', balance_due: 400000, due_31_60: 0, due_91_120: 400000 }),
          ageingRow({ id: 'o2', bp_code: 'BP-8', balance_due: 400000, due_0_30: 400000 }),
        ],
      })
    )
    expect(byId(kpis, 'critical-overdue').value).toBe('₹4L')
    expect(byId(kpis, 'critical-overdue').hint).toContain('50% of the ageing book')
    expect(byId(kpis, 'critical-overdue').tone).toBe('bad')
  })

  it('carries the four cards asked for and nothing that reads zero forever', () => {
    /*
     * "Team logged today 0/11" and "Needs escalation ₹0" were both accurate
     * and both unchanging, because nothing in the live system writes the data
     * behind them. Client commitments can also read zero — but it moves the
     * moment somebody logs a follow-up, which is the difference.
     */
    const ids = buildRoleKpis(snapshot('team_leader')).map((k) => k.id)
    expect(ids).toEqual([
      'active-payments',
      'overdue-payments',
      'team-commitments',
      'critical-overdue',
    ])
  })
})

describe('uploaded ageing rows reach the assigned coordinator', () => {
  const overdueOf = (over: Partial<KpiSnapshot>) =>
    byId(buildRoleKpis(snapshot('coordinator', over)), 'my-overdue-payments').value

  it("counts an uploaded balance in the owner's overdue book", () => {
    expect(
      overdueOf({
        overduePayments: [
          ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 500000, assigned_coordinator_id: 'coord-1' }),
          ageingRow({ id: 'o2', bp_code: 'BP-8', balance_due: 320000, assigned_coordinator_id: 'coord-1' }),
        ],
      })
    ).toBe('₹8.2L')
  })

  it("does not leak another coordinator's uploaded rows", () => {
    expect(
      overdueOf({
        overduePayments: [
          ageingRow({ id: 'o1', bp_code: 'BP-9', assigned_coordinator_id: 'coord-3' }),
        ],
      })
    ).toBe('₹0')
  })

  it('ignores an ageing row that has been settled', () => {
    expect(
      overdueOf({
        overduePayments: [ageingRow({ id: 'o1', status: 'settled', balance_due: 500000 })],
      })
    ).toBe('₹0')
  })

  it('ignores an ageing row that has been set aside', () => {
    expect(
      overdueOf({
        overduePayments: [ageingRow({ id: 'o1', balance_due: 500000, no_followup_at: day(-2) })],
      })
    ).toBe('₹0')
  })

  it('holds a bankrupt balance out, the same as no follow-up', () => {
    // Since 11 Sept 2026 a bankrupt customer leaves every total and list and is
    // listed only in the Bankrupt register; the Overdue page agrees.
    expect(
      overdueOf({
        overduePayments: [ageingRow({ id: 'o1', status: 'bankrupt', balance_due: 500000 })],
      })
    ).toBe('₹0')
  })

  it('names the ageing balances the leader has no invoice for', () => {
    /*
     * The two books are reported separately, so nothing is hidden by the split
     * — but the leader still wants to know which ageing balances never became
     * invoices, because those are the ones no coordinator has a row to open.
     */
    const kpis = buildRoleKpis(
      snapshot('team_leader', {
        companies: [companyRow('c1', { sap_bp_code: 'BP-1', total_amount: 118000 })],
        overduePayments: [
          ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 500000, assigned_coordinator_id: 'coord-5' }),
          // Already invoiced above: the same money, not an addition.
          ageingRow({ id: 'o2', bp_code: 'BP-1', balance_due: 118000, assigned_coordinator_id: 'coord-1' }),
        ],
      })
    )
    expect(byId(kpis, 'overdue-payments').hint).toContain('plus ₹5L on 1 account in ageing only')
  })

  it('matches a BP code whatever case and spacing it was typed in', () => {
    const kpis = buildRoleKpis(
      snapshot('team_leader', {
        companies: [companyRow('c1', { sap_bp_code: ' bp-9 ' })],
        overduePayments: [ageingRow({ id: 'o1', bp_code: 'BP-9', balance_due: 500000 })],
      })
    )
    expect(byId(kpis, 'overdue-payments').hint).not.toContain('ageing only')
  })

  it('calls a credit a credit rather than something the report adds', () => {
    // The live file's uninvoiced remainder is negative. "The ageing report
    // adds -₹42L" is the kind of sentence that makes people stop reading.
    const kpis = buildRoleKpis(
      snapshot('team_leader', {
        companies: [companyRow('c1', { sap_bp_code: 'BP-1' })],
        overduePayments: [ageingRow({ id: 'o1', bp_code: 'BP-7', balance_due: -150000 })],
      })
    )
    expect(byId(kpis, 'overdue-payments').hint).toContain('1 account in ageing only, ₹1.5L in credit')
  })
})

describe('the team leader gets the company position', () => {
  // She ran the book as the administrator until the owner account was split
  // out. Falling through to the coordinator branch would hand her a worklist of
  // her own accounts; the administrator's cards would hand her the plumbing.
  // The book and the people working it are hers.
  it('reads the book, not a worklist and not the system', () => {
    const leader = buildRoleKpis(snapshot('team_leader')).map((k) => k.id)
    const admin = buildRoleKpis(snapshot('admin')).map((k) => k.id)
    const coordinator = buildRoleKpis(snapshot('coordinator')).map((k) => k.id)

    expect(leader).toContain('active-payments')
    expect(leader).not.toEqual(coordinator)
    expect(leader).not.toEqual(admin)
  })

  it('heads them with the company position rather than her own accounts', () => {
    expect(kpiSectionTitle('team_leader')).toBe('Company position')
    expect(kpiSectionTitle('coordinator')).not.toBe('Company position')
  })
})

describe('super admin KPIs', () => {
  /*
   * The administrator is asked to keep the machine working, and each of these
   * is a way it can be quietly wrong while every other screen looks healthy.
   */
  /** The least a Company can be and still be counted. */
  const owned = (id: string, coordinator: string | null) =>
    ({
      id,
      sap_bp_code: id.toUpperCase(),
      invoice_no: '1',
      name: id,
      contact_person: null,
      contact_number: '',
      email: null,
      payment_terms: 'Net-30',
      total_amount: 100000,
      invoice_date: null,
      due_date: TODAY,
      status: 'overdue',
      assigned_coordinator_id: coordinator,
      module: null,
      remarks: null,
      extra_fields: {},
      created_at: TODAY,
      updated_at: TODAY,
    }) as any

  const log = (over: Record<string, unknown> = {}) => ({
    // Stamped now: freshness is measured against the real clock, so a fixed
    // date would quietly turn this suite stale tomorrow.
    syncedAt: new Date().toISOString(),
    modifiedAt: new Date(Date.now() - 3_600_000).toISOString(),
    created: 0,
    updated: 0,
    added: 0,
    addedValue: 0,
    changed: 0,
    delta: 0,
    settled: 0,
    upgraded: 0,
    skipped: 0,
    needsCoordinator: 0,
    filteredOut: 0,
    success: true,
    ...over,
  })

  it('says when a book has never been imported', () => {
    // Every figure on every other screen would read as fine, because they show
    // what was imported rather than what the file says.
    const kpis = buildRoleKpis(snapshot('admin', { syncLog: {} }))
    const freshness = kpis.find((k) => k.id === 'data-freshness')
    expect(freshness?.value).toBe('Not synced')
    expect(freshness?.tone).toBe('bad')
  })

  it('says when the last sync failed', () => {
    const kpis = buildRoleKpis(
      snapshot('admin', { syncLog: { companies: log({ success: false }), overdue: log() } })
    )
    expect(kpis.find((k) => k.id === 'data-freshness')?.hint).toMatch(/failed/i)
  })

  it('counts the rows that never reached the CRM at all', () => {
    /*
     * The card that had nowhere to live before. A row the import held back for
     * an unrecognised coordinator is real money in none of the business's own
     * figures and on nobody's list, so only the administrator can find it.
     */
    const kpis = buildRoleKpis(
      snapshot('admin', {
        syncLog: { companies: log({ needsCoordinator: 162 }), overdue: log({ needsCoordinator: 12 }) },
      })
    )
    const held = kpis.find((k) => k.id === 'not-arriving')
    expect(held?.value).toBe('174')
    expect(held?.tone).toBe('warn')
  })

  it('names accounts nobody is answering for', () => {
    const kpis = buildRoleKpis(
      snapshot('admin', {
        companies: [owned('c1', null), owned('c2', 'coord-1')],
        syncLog: { companies: log(), overdue: log() },
      })
    )
    const unowned = kpis.find((k) => k.id === 'unowned')
    expect(unowned?.value).toBe('1')
    expect(unowned?.tone).toBe('bad')
  })

  it('quotes the same book the leader is quoted', () => {
    /*
     * They were ₹15.4Cr and ₹15.5Cr for the same money, one login apart,
     * because the administrator's card went through the receivables book while
     * the leader's read the invoices. A difference nobody can account for is
     * worse than either figure being slightly less useful.
     */
    const companies = [
      owned('c1', 'coord-1'),
      owned('c2', 'coord-2'),
      owned('c3', null),
    ]
    const admin = buildRoleKpis(snapshot('admin', { companies, syncLog: { companies: log(), overdue: log() } }))
    const leader = buildRoleKpis(snapshot('team_leader', { companies }))
    expect(byId(admin, 'book-size').value).toBe(byId(leader, 'active-payments').value)
  })

  it('is quiet when the system is healthy', () => {
    const kpis = buildRoleKpis(
      snapshot('admin', { companies: [], syncLog: { companies: log(), overdue: log() } })
    )
    expect(kpis.filter((k) => k.tone === 'bad' || k.tone === 'warn')).toEqual([])
  })
})
