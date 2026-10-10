import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadError } from './types'

/**
 * How the working dataset is saved.
 *
 * A live Excel sync re-reads a four-thousand-row workbook every time. Two
 * things went wrong with that and both are covered here: the refused rows piled
 * up until the browser refused to save at all — silently, so everything was
 * gone at the next sign-in — and every imported row re-serialised the whole
 * dataset, which turned one import into the best part of a minute.
 */

/** A localStorage that can be told to run out of room. */
function memoryStorage() {
  const map = new Map<string, string>()
  const state = { limit: Infinity, writes: 0 }
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      state.writes++
      if (value.length > state.limit) {
        const err = new Error('QuotaExceededError')
        err.name = 'QuotaExceededError'
        throw err
      }
      map.set(key, value)
    },
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  } as unknown as Storage
  return { storage, state, map }
}

const { storage, state, map } = memoryStorage()
vi.stubGlobal('localStorage', storage)

const { demoCompanyStore, inBulk, onStorageFailure, MAX_UPLOAD_ERRORS } = await import('./demo-companies')

const anError = (n: number): UploadError => ({
  id: `e${n}`,
  upload_id: 'upl-1',
  row_number: n,
  // Roughly what a refused row costs: the whole raw row is kept with it.
  raw_data: { a: 'x'.repeat(200) },
  errors: ['Unassigned coordinator'],
  resolved: false,
  created_at: new Date().toISOString(),
})

beforeEach(() => {
  state.limit = Infinity
  state.writes = 0
  demoCompanyStore.uploadErrors = []
  demoCompanyStore.storageFailed = false
})

describe('the queue of refused rows', () => {
  it('keeps only the most recent, so a daily sync cannot fill the browser', () => {
    // The same rows fail on every sync; keeping them all is what broke it.
    for (let i = 0; i < MAX_UPLOAD_ERRORS + 1500; i++) demoCompanyStore.addUploadError(anError(i))

    expect(demoCompanyStore.uploadErrors).toHaveLength(MAX_UPLOAD_ERRORS)
    // The newest are the ones a person would work through.
    expect(demoCompanyStore.uploadErrors.at(-1)?.row_number).toBe(MAX_UPLOAD_ERRORS + 1499)
  })

  it('does not grow when the same import is repeated', () => {
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 800; i++) demoCompanyStore.addUploadError(anError(i))
    }
    expect(demoCompanyStore.uploadErrors).toHaveLength(MAX_UPLOAD_ERRORS)
  })
})

describe('matching an invoice during a sync', () => {
  /*
   * Each stored record's invoice key is cached against the record object, so a
   * sync does not recompute a million keys. The one way that could go wrong is
   * a record whose identifying fields change in place and keeps its old key.
   */
  it('follows a record whose BP code was corrected, not its old key', () => {
    demoCompanyStore.resetToSeeds()
    try {
      const base = demoCompanyStore.companies[0]
      const stored = demoCompanyStore.upsertCompany({ ...base, id: 'inv-key', sap_bp_code: 'OLD-1', invoice_no: 'INV/9' })

      // Warm the cache under the old code first.
      expect(demoCompanyStore.findExistingCompany('OLD-1', stored.name, '', 'INV/9')?.id).toBe('inv-key')

      demoCompanyStore.updateCompany('inv-key', { sap_bp_code: 'NEW-1' })
      expect(demoCompanyStore.findExistingCompany('NEW-1', stored.name, '', 'INV/9')?.id).toBe('inv-key')
      expect(demoCompanyStore.findExistingCompany('OLD-1', stored.name, '', 'INV/9')).toBeUndefined()
    } finally {
      // The store is shared; later tests expect only the shipped customers.
      demoCompanyStore.resetToSeeds()
    }  })

  it('still tells apart two customers who reuse an invoice number', () => {
    // 26 invoice numbers in the live file belong to two customers each.
    demoCompanyStore.resetToSeeds()
    try {
      const base = demoCompanyStore.companies[0]
      demoCompanyStore.upsertCompany({ ...base, id: 'a-27', sap_bp_code: 'C0155', invoice_no: '27' })
      demoCompanyStore.upsertCompany({ ...base, id: 'b-27', sap_bp_code: 'C0004', invoice_no: '27' })

      expect(demoCompanyStore.findExistingCompany('C0155', base.name, '', '27')?.id).toBe('a-27')
      expect(demoCompanyStore.findExistingCompany('c0004 ', base.name, '', '27')?.id).toBe('b-27')
    } finally {
      demoCompanyStore.resetToSeeds()
    }  })
})

describe('a refused row keeps only what identifies it', () => {
  it('drops the rest of the spreadsheet line, which nothing reads back', () => {
    demoCompanyStore.addUploadError({
      ...anError(1),
      raw_data: {
        'BP Code': 'C0004',
        'Company Name': 'Aculife Healthcare',
        Coordinator: 'Devyani Vaghela',
        'Invoice No': 1634,
        'Contact Email': 'someone@example.com',
        'Payment Terms': 'Net-90',
        Remarks: 'x'.repeat(500),
      },
    })

    expect(demoCompanyStore.uploadErrors.at(-1)?.raw_data).toEqual({
      'BP Code': 'C0004',
      'Company Name': 'Aculife Healthcare',
      Coordinator: 'Devyani Vaghela',
      'Invoice No': 1634,
    })
  })

  it('keeps the reason it was refused and where it was in the file', () => {
    demoCompanyStore.addUploadError({ ...anError(42), raw_data: { 'BP Code': 'C1', Notes: 'x'.repeat(300) } })
    const kept = demoCompanyStore.uploadErrors.at(-1)
    expect(kept?.row_number).toBe(42)
    expect(kept?.errors).toEqual(['Unassigned coordinator'])
  })
})

describe('when the browser will not save', () => {
  it('drops the refused rows and saves the records that matter', () => {
    for (let i = 0; i < MAX_UPLOAD_ERRORS; i++) demoCompanyStore.addUploadError(anError(i))

    // Small enough for the records, too small for the records plus the queue.
    const withErrors = JSON.stringify({ uploadErrors: demoCompanyStore.uploadErrors }).length
    state.limit = withErrors
    demoCompanyStore.persist()

    expect(demoCompanyStore.uploadErrors).toHaveLength(0)
    // The accounts themselves are still saved, which is the whole point.
    const saved = JSON.parse(map.get('crm_demo_store') ?? '{}')
    expect(Array.isArray(saved.companies)).toBe(true)
  })

  it('says so instead of failing silently', () => {
    const told = vi.fn()
    const stop = onStorageFailure(told)

    state.limit = 1
    demoCompanyStore.persist()

    expect(told).toHaveBeenCalledTimes(1)
    expect(demoCompanyStore.storageFailed).toBe(true)
    stop()
  })

  it('reports it once, not on every save', () => {
    const told = vi.fn()
    const stop = onStorageFailure(told)

    state.limit = 1
    demoCompanyStore.persist()
    demoCompanyStore.persist()
    demoCompanyStore.persist()

    expect(told).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('a bulk import', () => {
  it('saves once at the end rather than once per row', async () => {
    // Persisting per row is what made a real import take fifty-six seconds.
    state.writes = 0

    await inBulk(async () => {
      for (let i = 0; i < 200; i++) {
        demoCompanyStore.addUploadError(anError(i))
        // Every await drains the microtask queue, which is what used to
        // trigger a full serialisation of the whole dataset.
        await Promise.resolve()
      }
    })

    expect(state.writes).toBe(1)
  })

  it('still saves everything the import changed', async () => {
    await inBulk(async () => {
      demoCompanyStore.addUploadError(anError(1))
      await Promise.resolve()
      demoCompanyStore.addUploadError(anError(2))
    })

    const saved = JSON.parse(map.get('crm_demo_store') ?? '{}')
    expect(saved.uploadErrors).toHaveLength(2)
  })

  it('saves nothing extra when the import changed nothing', async () => {
    state.writes = 0
    await inBulk(async () => {
      demoCompanyStore.getAllCompanies()
    })
    expect(state.writes).toBe(0)
  })
})

describe('the shipped demo customers', () => {
  it('go once a real import brings in data of its own', () => {
    const before = demoCompanyStore.companies.length
    expect(before).toBeGreaterThan(0)

    // Nothing in the file matched them, so they are just wrong figures now.
    const dropped = demoCompanyStore.dropUntouchedSeeds(new Set<string>())

    expect(dropped).toBeGreaterThan(0)
    expect(demoCompanyStore.companies).toHaveLength(0)
    expect(demoCompanyStore.overduePayments).toHaveLength(0)
  })

  it('stay when the imported file carries the same customer', () => {
    demoCompanyStore.resetToSeeds()
    const kept = demoCompanyStore.companies[0].id

    // The upsert matched it by BP code, so it is real data now, not a seed.
    demoCompanyStore.dropUntouchedSeeds(new Set([kept]))

    expect(demoCompanyStore.companies.map((c) => c.id)).toContain(kept)
  })

  it('takes their follow-ups with them, leaving nothing dangling', () => {
    demoCompanyStore.resetToSeeds()
    expect(demoCompanyStore.followups.length).toBeGreaterThan(0)

    demoCompanyStore.dropUntouchedSeeds(new Set<string>())

    const ids = new Set([
      ...demoCompanyStore.companies.map((c) => c.id),
      ...demoCompanyStore.overduePayments.map((o) => o.id),
    ])
    expect(demoCompanyStore.followups.every((f) => ids.has(f.entity_id))).toBe(true)
  })

  it('does nothing at all once they are already gone', () => {
    demoCompanyStore.dropUntouchedSeeds(new Set<string>())
    expect(demoCompanyStore.dropUntouchedSeeds(new Set<string>())).toBe(0)
  })
})

/**
 * A follow-up is the only thing on these screens the team wrote themselves.
 *
 * Everything else can be rebuilt by re-reading the workbook; a note about what
 * a customer said on the phone cannot. So the question is not whether it saves
 * — it is whether it is still there tomorrow, after the file has been read
 * again over the top of the account it belongs to.
 *
 * Accounts are asserted by the note, not by a count: the shipped demo data has
 * follow-ups of its own, and a test that counts them proves nothing about the
 * one that was just written.
 */
describe('a logged follow-up outlives the next sync', () => {
  const NOTE = 'Spoke to accounts, cheque on Friday'

  const noteFor = (entityId: string, entityType: 'company' | 'overdue_payment') => ({
    id: `probe-${entityType}-${entityId}`,
    entity_type: entityType,
    entity_id: entityId,
    coordinator_id: 'coord-1',
    followup_date: new Date().toISOString(),
    mode: 'call' as const,
    notes: NOTE,
    customer_response: 'Will pay by date',
    committed_date: '2026-12-01',
    committed_amount: 250000,
    status: 'committed' as const,
    proof_attachment_url: null,
    next_reminder_date: '2026-12-01',
    created_at: new Date().toISOString(),
    edited_at: null,
  })

  const mine = (entityId: string, entityType: 'company' | 'overdue_payment' = 'company') =>
    demoCompanyStore.getFollowupsForEntity(entityId, entityType).filter((f) => f.notes === NOTE)

  beforeEach(() => {
    demoCompanyStore.resetToSeeds()
  })

  it('is still on the account after the same workbook is read again', () => {
    const account = demoCompanyStore.companies[0]
    demoCompanyStore.addFollowup(noteFor(account.id, 'company'))

    // Tomorrow's file carries the same invoice, with a changed amount.
    demoCompanyStore.upsertCompany({ ...account, total_amount: (account.total_amount || 0) + 1000 })

    expect(mine(account.id)).toHaveLength(1)
    expect(mine(account.id)[0].committed_amount).toBe(250000)
    // The record must keep its id, which is the only thing tying the two together.
    expect(demoCompanyStore.companies.find((c) => c.id === account.id)).toBeTruthy()
  })

  it('is still on the ageing row after the same workbook is read again', () => {
    const row = demoCompanyStore.overduePayments[0]
    demoCompanyStore.addFollowup(noteFor(row.id, 'overdue_payment'))

    demoCompanyStore.upsertOverduePayment({ ...row, balance_due: (row.balance_due || 0) + 1000 })

    expect(mine(row.id, 'overdue_payment')).toHaveLength(1)
  })

  it('moves with the account when one record is split into invoices', () => {
    /*
     * The invoice-level upgrade replaced one per-customer record with one per
     * invoice. A note logged before that must follow the account rather than
     * being left pointing at an id that no longer exists.
     */
    const account = demoCompanyStore.companies[0]
    demoCompanyStore.addFollowup(noteFor(account.id, 'company'))

    const replacement = demoCompanyStore.upsertCompany({
      ...account,
      id: 'comp-split-1',
      invoice_no: 'INV/SPLIT/1',
    })
    demoCompanyStore.supersedeCompany(account.id, [replacement.id])

    expect(mine(account.id)).toHaveLength(0)
    expect(mine(replacement.id)).toHaveLength(1)
  })

  it('is not dropped as a stale seed once its account has been imported', () => {
    // dropUntouchedSeeds clears demo customers the file never mentioned. An
    // account the sync touched is real data, and so is the note against it.
    const account = demoCompanyStore.companies[0]
    demoCompanyStore.addFollowup(noteFor(account.id, 'company'))

    demoCompanyStore.dropUntouchedSeeds(new Set([account.id]))

    expect(mine(account.id)).toHaveLength(1)
  })

  it('reaches storage without waiting for anything else to be saved', async () => {
    /*
     * Saving is scheduled on a microtask, so it lands after the call returns
     * but before the next thing the coordinator does. What must not happen is
     * it waiting for some unrelated write to carry it — that is how a note
     * logged at five o'clock is gone in the morning.
     */
    const account = demoCompanyStore.companies[0]
    demoCompanyStore.addFollowup(noteFor(account.id, 'company'))

    await Promise.resolve()

    const saved = JSON.parse(map.get('crm_demo_store') || '{}')
    expect(
      (saved.followups || []).filter((f: { notes?: string }) => f.notes === NOTE)
    ).toHaveLength(1)
  })
})

describe('declaring a company bankrupt', () => {
  const row = () => demoCompanyStore.overduePayments[0]

  beforeEach(() => {
    demoCompanyStore.resetToSeeds()
  })

  it('records who decided it, when, and why', () => {
    demoCompanyStore.declareBankrupt(row().id, 'admin-1', 'NCLT petition 442/2026')

    expect(row().status).toBe('bankrupt')
    expect(row().bankrupt_declared_by).toBe('admin-1')
    expect(row().bankrupt_note).toBe('NCLT petition 442/2026')
    expect(Date.parse(row().bankrupt_declared_at!)).not.toBeNaN()
  })

  it('is not undone by a follow-up logged against the account', () => {
    // Somebody adding a note must not quietly put it back in the queue.
    demoCompanyStore.declareBankrupt(row().id, 'admin-1')
    demoCompanyStore.touchOverduePayment(row().id, 'no_response')

    expect(row().status).toBe('bankrupt')
  })

  it('a follow-up never reopens a balance the Excel file settled', () => {
    // Neilmed, 6 Oct 2026: settled by the sync, a call logged after, back in the list at ₹0.
    const { payment } = demoCompanyStore.upsertOverduePayment({ ...row(), id: 'ovd-neilmed', bp_code: 'BP-NEILMED' })
    demoCompanyStore.settleOverduePayments([payment.id])
    demoCompanyStore.touchOverduePayment(payment.id, 'committed')

    expect(demoCompanyStore.getOverduePaymentById(payment.id)?.status).toBe('settled')
  })

  it('can be undone, back to what the ageing itself says', () => {
    const id = row().id
    const aged = (row().due_91_120 || 0) + (row().due_121_plus || 0) > 0

    demoCompanyStore.declareBankrupt(id, 'admin-1', 'declared in error')
    demoCompanyStore.reinstateOverduePayment(id)

    const after = demoCompanyStore.getOverduePaymentById(id)!
    expect(after.status).toBe(aged ? 'critical' : 'overdue')
    expect(after.bankrupt_declared_by).toBeNull()
    expect(after.bankrupt_note).toBeNull()
  })

  it('holds the balance out of the total and the count, and reports it on its own', () => {
    const before = demoCompanyStore.getOverdueStats()
    const balance = row().balance_due

    demoCompanyStore.declareBankrupt(row().id, 'admin-1')
    const stats = demoCompanyStore.getOverdueStats()

    expect(stats.totalBalance).toBe(before.totalBalance - balance)
    expect(stats.total).toBe(before.total - 1)
    expect(stats.bankrupt).toBe(1)
    expect(stats.bankruptBalance).toBe(balance)
  })

  /*
   * The customer is given a BP code nobody else has, so every figure below is
   * exactly this customer's and nothing a seeded invoice happens to share.
   */
  const isolate = () => demoCompanyStore.updateOverduePayment(row().id, { bp_code: 'BK-TEST' })

  /** An open invoice of the same customer, the way the live book holds most of them. */
  const invoiceOfTheSameCustomer = (id: string, amount: number) => {
    const base = demoCompanyStore.companies[0]
    return demoCompanyStore.upsertCompany({
      ...base,
      id,
      sap_bp_code: row().bp_code,
      invoice_no: id.toUpperCase(),
      status: 'overdue',
      total_amount: amount,
      no_followup_at: null,
      bankrupt_declared_at: null,
    })
  }

  it("takes the customer's Active Payments invoices out with it", () => {
    isolate()
    invoiceOfTheSameCustomer('bk-1', 300000)
    const before = demoCompanyStore.getCompanyStats()

    demoCompanyStore.declareBankrupt(row().id, 'admin-1', 'NCLT')
    const after = demoCompanyStore.getCompanyStats()

    expect(demoCompanyStore.getCompanyById('bk-1')?.bankrupt_declared_by).toBe('admin-1')
    expect(after.totalOutstanding).toBe(before.totalOutstanding - 300000)
    expect(after.bankrupt).toBe(1)
    expect(after.bankruptAmount).toBe(300000)
  })

  it('gives the invoices back when the declaration is undone', () => {
    isolate()
    invoiceOfTheSameCustomer('bk-1', 300000)
    const before = demoCompanyStore.getCompanyStats().totalOutstanding

    demoCompanyStore.declareBankrupt(row().id, 'admin-1')
    demoCompanyStore.reinstateOverduePayment(row().id)

    expect(demoCompanyStore.getCompanyById('bk-1')?.bankrupt_declared_at).toBeNull()
    expect(demoCompanyStore.getCompanyStats().totalOutstanding).toBe(before)
  })

  it('keeps the invoices held out through a re-import', () => {
    isolate()
    invoiceOfTheSameCustomer('bk-1', 300000)
    demoCompanyStore.declareBankrupt(row().id, 'admin-1')

    // Tomorrow's file lists the invoice again, knowing nothing of the decision.
    const base = demoCompanyStore.companies[0]
    demoCompanyStore.upsertCompany({
      ...base,
      id: '',
      sap_bp_code: 'BK-TEST',
      invoice_no: 'BK-1',
      total_amount: 310000,
      no_followup_at: null,
      bankrupt_declared_at: undefined,
      bankrupt_declared_by: undefined,
      bankrupt_note: undefined,
    })

    expect(demoCompanyStore.getCompanyById('bk-1')?.bankrupt_declared_at).toBeTruthy()
  })

  it('holds out a new invoice that arrives for a bankrupt customer', () => {
    isolate()
    demoCompanyStore.declareBankrupt(row().id, 'admin-1')

    const arrived = invoiceOfTheSameCustomer('bk-new', 50000)
    expect(arrived.bankrupt_declared_at).toBeTruthy()
  })

  it('survives a re-import of the same workbook', () => {
    const id = row().id
    demoCompanyStore.declareBankrupt(id, 'admin-1')

    // Tomorrow's file still lists the customer as an ordinary overdue balance.
    demoCompanyStore.upsertOverduePayment({ ...row(), status: 'critical' })

    expect(demoCompanyStore.getOverduePaymentById(id)?.status).toBe('bankrupt')
  })
})
