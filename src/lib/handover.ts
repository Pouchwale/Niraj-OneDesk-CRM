/**
 * Handing one coordinator's customers to others.
 *
 * Vishva Vyas's desk was split across Disha Acharya and Krina Shah - 70/30,
 * nothing left behind. Reassigning the records once would not have held: the
 * SAP export still names her on every one of those rows, and both books take
 * the owner straight from the file, so the next morning's sync would have
 * handed all of them back. So this is a standing rule applied at the import
 * seam, not an edit.
 *
 * Two things it has to get right:
 *
 * A customer stays whole. The split is decided per customer (BP code), never
 * per invoice, so all of a customer's invoices and their ageing row sit with
 * one person. Splitting a customer's invoices between two coordinators would
 * have two people chasing the same accountant.
 *
 * A customer stays put. Who got whom is pinned in a ledger, so a customer
 * never moves between the two on a later sync, and a new customer arriving in
 * Vishva's name goes to whichever of the two is furthest below their share.
 */

// Relative, not the '@shared' alias: this module is now in the server's import
// chain, and the dev server loads that chain while building the very config
// that defines the alias.
import { SEED_PROFILES } from '../../shared/roster'
import { normalizeBpCode } from './bp-code'

export interface HandoverShare {
  coordinatorId: string
  /** Whole percent of the customers. The shares of a rule must total 100. */
  percent: number
}

export interface HandoverRule {
  id: string
  /** The coordinator being handed over; they keep nothing. */
  fromCoordinatorId: string
  shares: HandoverShare[]
  /** Why, for whoever reads the audit trail in six months. */
  note: string
  effective_from: string
}

/**
 * The handover in force.
 *
 * Seeded in code rather than stored, like the coordinator aliases: it is a
 * decision about the team, so it must not depend on one browser's storage or
 * be undone by clearing the data.
 */
export const HANDOVER_RULES: HandoverRule[] = [
  {
    id: 'handover-vishva-2026-09',
    fromCoordinatorId: 'coord-9',
    shares: [
      { coordinatorId: 'coord-10', percent: 70 },
      { coordinatorId: 'coord-7', percent: 30 },
    ],
    note: "Vishva Vyas's customers moved to Disha Acharya (70%) and Krina Shah (30%)",
    effective_from: '2026-09-12',
  },
]

/**
 * A coordinator's name, for the records that carry a name as well as an id.
 *
 * Looked up through a resolver the app registers, rather than by importing the
 * roster directly: this module has to run on the server as well as in the
 * browser, and the roster there lives behind React. The shipped roster is the
 * floor, so a handed-over row is never labelled "Unknown" even before anyone
 * has signed in.
 */
type NameResolver = (coordinatorId: string) => string | null

let liveNames: NameResolver | null = null

/** The app registers the live roster at startup; the server leaves it unset. */
export function useCoordinatorNames(resolver: NameResolver | null): void {
  liveNames = resolver
}

export function coordinatorNameFor(coordinatorId: string): string | null {
  return (
    liveNames?.(coordinatorId) ??
    SEED_PROFILES.find((profile) => profile.id === coordinatorId)?.full_name ??
    null
  )
}

/** The rule handing this coordinator's customers on, if there is one. */
export function ruleFor(coordinatorId: string | null | undefined): HandoverRule | undefined {
  if (!coordinatorId) return undefined
  return HANDOVER_RULES.find((rule) => rule.fromCoordinatorId === coordinatorId)
}

/** True when no rows should be left with this coordinator. */
export function isHandedOver(coordinatorId: string | null | undefined): boolean {
  return ruleFor(coordinatorId) !== undefined
}

/* ===================== The ledger ===================== */

/**
 * Which customer went to whom, by rule.
 *
 * Kept apart from the working data so a re-import, or clearing the records,
 * cannot shuffle customers between the two coordinators - a customer moving
 * desk twice in a week is exactly what this is meant to prevent.
 */
const LEDGER_KEY = 'crm_handover_ledger'

type Ledger = Record<string, Record<string, string>>

let ledger: Ledger | null = null

function load(): Ledger {
  if (ledger) return ledger
  ledger = {}
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') ledger = parsed as Ledger
  } catch {
    // No storage (tests run in node), private browsing, or corrupt JSON: the
    // allocation below rebuilds the same answer from the same customers.
  }
  return ledger
}

function save(): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(load()))
  } catch {
    // A full quota must never fail the import in progress.
  }
}

/** Forgets the pinned assignments. Tests, and nothing else. */
export function resetHandoverLedger(): void {
  ledger = {}
  try {
    localStorage.removeItem(LEDGER_KEY)
  } catch {
    /* nothing to forget */
  }
}

/** How many customers each side currently holds under a rule. */
export function handoverCounts(rule: HandoverRule): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const share of rule.shares) counts[share.coordinatorId] = 0
  for (const owner of Object.values(load()[rule.id] ?? {})) {
    if (owner in counts) counts[owner]++
  }
  return counts
}

/**
 * Whose turn it is.
 *
 * Largest remainder: the next customer goes to whoever is furthest below what
 * their percentage entitles them to once that customer is counted. Over ten
 * customers 70/30 lands exactly seven and three, and over three hundred,
 * exactly two hundred and ten and ninety.
 */
function nextOwner(rule: HandoverRule, counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0) + 1
  let best = ''
  let bestGap = -Infinity
  for (const share of rule.shares) {
    // A zero share is a coordinator keeping nothing: never their turn.
    if (share.percent <= 0) continue
    const gap = (share.percent / 100) * total - (counts[share.coordinatorId] ?? 0)
    if (gap > bestGap) {
      bestGap = gap
      best = share.coordinatorId
    }
  }
  return best
}

/**
 * Pins an owner for every one of these customers, and returns the mapping.
 *
 * Allocated in BP-code order rather than the order the file happens to list
 * them, so the same customers always produce the same split - a fresh browser
 * importing the same workbook reaches the same answer.
 */
export function planHandover(
  rule: HandoverRule,
  bpCodes: (string | null | undefined)[]
): Record<string, string> {
  const book = load()
  const pinned = (book[rule.id] ??= {})
  const counts = handoverCounts(rule)

  const fresh = [...new Set(bpCodes.map(normalizeBpCode).filter((code): code is string => code !== null))]
    .filter((code) => !(code in pinned))
    .sort()

  let changed = false
  for (const code of fresh) {
    const owner = nextOwner(rule, counts)
    if (!owner) continue
    pinned[code] = owner
    counts[owner] = (counts[owner] ?? 0) + 1
    changed = true
  }
  if (changed) save()
  return pinned
}

/**
 * The coordinator a row belongs to once the handover is applied.
 *
 * Returns the owner unchanged when no rule touches them - every row in both
 * books goes through here, and all but one desk's are none of its business.
 * A customer with no BP code cannot be pinned, so they are allocated the same
 * way but not remembered.
 */
export function ownerAfterHandover(
  coordinatorId: string | null,
  bpCode: string | null | undefined
): string | null {
  const rule = ruleFor(coordinatorId)
  if (!rule) return coordinatorId

  const code = normalizeBpCode(bpCode)
  if (code === null) return nextOwner(rule, handoverCounts(rule))

  const pinned = planHandover(rule, [code])
  return pinned[code] ?? coordinatorId
}

/**
 * Applies every rule across a set of rows in one pass.
 *
 * A whole import at once, rather than a row at a time, so the allocation runs
 * over the customers in BP-code order: the file lists a customer's invoices
 * wherever they fall, and letting that order drive the split would give a
 * different answer for the same workbook.
 *
 * Returns how many rows changed hands.
 */
export function applyHandoverToRows<T>(
  rows: T[],
  ownerOf: (row: T) => string | null,
  bpCodeOf: (row: T) => string | null | undefined,
  assign: (row: T, coordinatorId: string, rule: HandoverRule) => void
): number {
  let moved = 0
  for (const rule of HANDOVER_RULES) {
    const affected = rows.filter((row) => ownerOf(row) === rule.fromCoordinatorId)
    if (affected.length === 0) continue

    const pinned = planHandover(rule, affected.map(bpCodeOf))
    for (const row of affected) {
      const code = normalizeBpCode(bpCodeOf(row))
      // A row with no BP code cannot be pinned to a customer, so it is placed
      // by the same rule but not remembered.
      const owner = (code !== null ? pinned[code] : null) ?? nextOwner(rule, handoverCounts(rule))
      if (!owner || owner === ownerOf(row)) continue
      assign(row, owner, rule)
      moved++
    }
  }
  return moved
}

/**
 * Records that a customer now sits with somebody else.
 *
 * A leader moving one customer by hand has to outlast tomorrow's sync too, so
 * the ledger - not the record - is what gets corrected.
 */
export function repinHandover(bpCode: string | null | undefined, coordinatorId: string): void {
  const code = normalizeBpCode(bpCode)
  if (code === null) return
  /*
   * Never back to a coordinator who has been handed over. Their share is zero,
   * and learning such a move would quietly reverse the handover for that
   * customer on every later sync - the record moves back on the next load.
   */
  if (isHandedOver(coordinatorId)) return
  const book = load()
  for (const rule of HANDOVER_RULES) {
    const pinned = book[rule.id]
    if (pinned && code in pinned && pinned[code] !== coordinatorId) {
      pinned[code] = coordinatorId
      save()
    }
  }
}
