/**
 * Splitting a coordinator's customers between two others.
 *
 * The thing worth testing here is not that the code runs: it is that the split
 * is exactly the percentage asked for, that a customer lands in the same place
 * in both books, and that it stays put when the same file is imported again
 * tomorrow. Getting any of those wrong puts two people on one accountant, or
 * moves a customer between desks every morning.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  HANDOVER_RULES,
  applyHandoverToRows,
  handoverCounts,
  isHandedOver,
  ownerAfterHandover,
  planHandover,
  repinHandover,
  resetHandoverLedger,
  ruleFor,
  type HandoverRule,
} from './handover'

/** The suite runs in Node, where there is no localStorage. */
if (typeof globalThis.localStorage === 'undefined') {
  const kept = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, String(value)),
      removeItem: (key: string) => kept.delete(key),
      clear: () => kept.clear(),
      key: (index: number) => [...kept.keys()][index] ?? null,
      get length() {
        return kept.size
      },
    },
  })
}

const VISHVA = 'coord-9'
const DISHA = 'coord-10'
const KRINA = 'coord-7'

const rule = (): HandoverRule => {
  const found = ruleFor(VISHVA)
  if (!found) throw new Error('the handover under test is not in force')
  return found
}

/** Customers, as the workbook spells them. */
const customers = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `BP-${String(1000 + i)}`)

beforeEach(() => {
  resetHandoverLedger()
})

describe('the rule in force', () => {
  it('hands Vishva Vyas on to Disha Acharya and Krina Shah, seventy and thirty', () => {
    expect(rule().shares).toEqual([
      { coordinatorId: DISHA, percent: 70 },
      { coordinatorId: KRINA, percent: 30 },
    ])
  })

  it('leaves her nothing', () => {
    // Zero is not written as a share: she is simply never a destination.
    expect(rule().shares.some((share) => share.coordinatorId === VISHVA)).toBe(false)
    expect(isHandedOver(VISHVA)).toBe(true)
  })

  it('touches nobody else', () => {
    for (const someone of [DISHA, KRINA, 'coord-1', 'admin-1', null]) {
      expect(isHandedOver(someone)).toBe(false)
      expect(ownerAfterHandover(someone, 'BP-1000')).toBe(someone)
    }
  })

  it('shares total a hundred percent, every rule', () => {
    for (const each of HANDOVER_RULES) {
      expect(each.shares.reduce((sum, share) => sum + share.percent, 0)).toBe(100)
    }
  })
})

describe('the split', () => {
  it('is exact over three hundred customers', () => {
    planHandover(rule(), customers(300))
    expect(handoverCounts(rule())).toEqual({ [DISHA]: 210, [KRINA]: 90 })
  })

  it('is exact wherever the percentage divides evenly', () => {
    for (const total of [10, 20, 50, 100, 250]) {
      resetHandoverLedger()
      planHandover(rule(), customers(total))
      expect(handoverCounts(rule())).toEqual({
        [DISHA]: total * 0.7,
        [KRINA]: total * 0.3,
      })
    }
  })

  it('is never more than one customer off, at any size', () => {
    for (const total of [1, 3, 7, 13, 99, 288, 301]) {
      resetHandoverLedger()
      planHandover(rule(), customers(total))
      const counts = handoverCounts(rule())
      expect(counts[DISHA] + counts[KRINA]).toBe(total)
      expect(Math.abs(counts[DISHA] - total * 0.7)).toBeLessThanOrEqual(1)
      expect(Math.abs(counts[KRINA] - total * 0.3)).toBeLessThanOrEqual(1)
    }
  })

  it('gives every customer an owner, and only to the two', () => {
    const pinned = planHandover(rule(), customers(300))
    expect(Object.keys(pinned)).toHaveLength(300)
    expect(new Set(Object.values(pinned))).toEqual(new Set([DISHA, KRINA]))
  })
})

describe('a customer stays whole and stays put', () => {
  it('sends a customer to the same place in both books', () => {
    // The ageing row and the invoices arrive separately and are keyed only by
    // the BP code; both have to resolve to one person.
    planHandover(rule(), customers(300))
    for (const code of customers(300)) {
      expect(ownerAfterHandover(VISHVA, code)).toBe(ownerAfterHandover(VISHVA, code))
    }
    const fromInvoices = customers(300).map((code) => ownerAfterHandover(VISHVA, code))
    const fromAgeing = customers(300).map((code) => ownerAfterHandover(VISHVA, `  ${code.toLowerCase()} `))
    expect(fromAgeing).toEqual(fromInvoices)
  })

  it('does not move anybody when the same file is imported again', () => {
    const first = { ...planHandover(rule(), customers(300)) }
    planHandover(rule(), customers(300))
    planHandover(rule(), customers(300))
    expect(planHandover(rule(), customers(300))).toEqual(first)
  })

  it('keeps everyone where they are when new customers arrive', () => {
    const first = { ...planHandover(rule(), customers(300)) }
    const grown = planHandover(rule(), customers(340))
    for (const [code, owner] of Object.entries(first)) expect(grown[code]).toBe(owner)
    // And the newcomers keep the ratio honest rather than piling on one side.
    const counts = handoverCounts(rule())
    expect(counts).toEqual({ [DISHA]: 238, [KRINA]: 102 })
  })

  it('reaches the same answer in a browser that starts empty', () => {
    const first = { ...planHandover(rule(), customers(300)) }
    resetHandoverLedger()
    // The file lists a customer's rows wherever they fall; the allocation must
    // not depend on that order.
    const shuffled = customers(300).sort((a, b) => (a > b ? -1 : 1))
    expect(planHandover(rule(), shuffled)).toEqual(first)
  })
})

describe('applied to rows', () => {
  interface Row {
    bp: string
    owner: string | null
  }
  const rows = (n: number, owner: string | null = VISHVA): Row[] =>
    customers(n).map((bp) => ({ bp, owner }))

  const apply = (list: Row[]) =>
    applyHandoverToRows(
      list,
      (row) => row.owner,
      (row) => row.bp,
      (row, coordinatorId) => {
        row.owner = coordinatorId
      }
    )

  it('leaves nothing with the coordinator who was handed over', () => {
    const list = rows(300)
    expect(apply(list)).toBe(300)
    expect(list.filter((row) => row.owner === VISHVA)).toHaveLength(0)
  })

  it('splits them seventy thirty', () => {
    const list = rows(300)
    apply(list)
    expect(list.filter((row) => row.owner === DISHA)).toHaveLength(210)
    expect(list.filter((row) => row.owner === KRINA)).toHaveLength(90)
  })

  it('keeps every invoice of one customer together', () => {
    // Active Payments is invoice-level: one customer, many rows.
    const list: Row[] = customers(300).flatMap((bp) =>
      [1, 2, 3].map(() => ({ bp, owner: VISHVA as string | null }))
    )
    apply(list)
    const byCustomer = new Map<string, Set<string | null>>()
    for (const row of list) {
      byCustomer.set(row.bp, (byCustomer.get(row.bp) ?? new Set()).add(row.owner))
    }
    for (const owners of byCustomer.values()) expect(owners.size).toBe(1)
  })

  it('touches nobody else’s rows', () => {
    const list = rows(50, 'coord-1')
    expect(apply(list)).toBe(0)
    expect(list.every((row) => row.owner === 'coord-1')).toBe(true)
  })

  it('changes nothing on a second run', () => {
    const list = rows(300)
    apply(list)
    const after = list.map((row) => row.owner)
    expect(apply(list)).toBe(0)
    expect(list.map((row) => row.owner)).toEqual(after)
  })

  it('still places a row that carries no BP code', () => {
    const list: Row[] = [{ bp: '', owner: VISHVA }]
    apply(list)
    expect([DISHA, KRINA]).toContain(list[0].owner)
  })
})

describe('moving one customer by hand', () => {
  it('sticks, rather than being undone by the next import', () => {
    planHandover(rule(), customers(300))
    const code = customers(300).find((c) => ownerAfterHandover(VISHVA, c) === DISHA)!

    repinHandover(code, KRINA)
    expect(ownerAfterHandover(VISHVA, code)).toBe(KRINA)
    // ...including after the file names Vishva on that customer again.
    planHandover(rule(), customers(300))
    expect(ownerAfterHandover(VISHVA, code)).toBe(KRINA)
  })

  it('cannot put a customer back with the coordinator who was handed over', () => {
    planHandover(rule(), customers(300))
    const code = customers(300)[0]
    const before = ownerAfterHandover(VISHVA, code)

    repinHandover(code, VISHVA)
    expect(ownerAfterHandover(VISHVA, code)).toBe(before)
    expect(ownerAfterHandover(VISHVA, code)).not.toBe(VISHVA)
  })

  it('leaves other customers where they are', () => {
    const before = { ...planHandover(rule(), customers(300)) }
    const code = customers(300)[5]
    repinHandover(code, KRINA)
    for (const [other, owner] of Object.entries(before)) {
      if (other !== code) expect(ownerAfterHandover(VISHVA, other)).toBe(owner)
    }
  })
})
