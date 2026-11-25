/**
 * Quotation Sheet settings (24 Nov 2026, the user's choice): the numbers inside
 * the Do not Send and Sales Quotation formulas, the dropdown lists, and the
 * Sales Quotation's fixed texts, which the administrator can change in the
 * Admin Panel. The formulas themselves stay as SAP has them; only these values
 * change. The defaults are SAP's, so with nothing saved both reports work
 * exactly as SAP's.
 *
 * A code a formula tests by name (Value Addition "None", "Rotary Screen",
 * "Gold Foil", "Silver Foil"; Coating "None"; charge "Included"; the delivery
 * zones the Dispatch Location formula writes out) cannot be removed or
 * renamed, or the formula would stop finding it.
 *
 * Pure, relative imports only: the server bundles the store, which uses this.
 */

import {
  COATING_TYPES, DELIVERY_ZONES, DIE_CHARGES, FREIGHTS, GSTS, MARKETING_PERSONS, MATERIALS, PAYMENT_TERMS, PLATE_CHARGES,
  PROOFING_CHARGES, VALUE_ADDITIONS, type Choice,
} from './flexo-rate-sheet'

/* ── Numbers ── */

export interface QuotationNumbers {
  teethPitch: number
  labelMargin: number
  sleeveMargin: number
  printSpeedL1: number
  printSpeedL2: number
  printSpeedL3: number
  changeoverL1: number
  changeoverL2: number
  changeoverL3: number
  wastageMetersL1: number
  wastageMetersL2: number
  wastageMetersL3: number
  labelLS: number
  otherLS: number
  conversionPerHour: number
  wastageRunPer: number
  wastageRunAdd: number
  wastageFactor: number
  wastageUplift: number
  inkRate: number
  weightFactor: number
  packingRate: number
  sleeveAddOn: number
  setMultiplier: number
  factorDivisor: number
  minPaperWidth: number
  maxPaperWidth: number
  profitWarning: number
  labelArGapMin: number
  labelArGapMax: number
  sleeveArGapMin: number
  sleeveArGapMax: number
  runningMetersLow: number
  runningMetersHigh: number
  sleeveTotalValueRed: number
  totalValueYellow: number
}

export type NumberKey = keyof QuotationNumbers

/** Every number, SAP's value, and where it is used (DNS = Do not Send, SQ = Sales Quotation, # = formula number). */
export const NUMBER_FIELDS: { key: NumberKey; label: string; value: number; usedIn: string; group: string }[] = [
  { group: 'Size', key: 'teethPitch', label: 'Teeth to circumference (mm per tooth)', value: 3.175, usedIn: 'Circumference: DNS #0, SQ #27' },
  { group: 'Size', key: 'labelMargin', label: 'Paper width margin, Label (mm)', value: 14, usedIn: 'Width: DNS #2, SQ #21' },
  { group: 'Size', key: 'sleeveMargin', label: 'Paper width margin, Sleeve (mm)', value: 20, usedIn: 'Width: DNS #2, SQ #21' },
  { group: 'Job level', key: 'printSpeedL1', label: 'Print Speed, Level 1', value: 80, usedIn: 'DNS #8, SQ #41' },
  { group: 'Job level', key: 'printSpeedL2', label: 'Print Speed, Level 2', value: 60, usedIn: 'DNS #8, SQ #41' },
  { group: 'Job level', key: 'printSpeedL3', label: 'Print Speed, Level 3', value: 40, usedIn: 'DNS #8, SQ #41' },
  { group: 'Job level', key: 'changeoverL1', label: 'Changeover Time (Hrs), Level 1', value: 1.0, usedIn: 'DNS #9, SQ #36' },
  { group: 'Job level', key: 'changeoverL2', label: 'Changeover Time (Hrs), Level 2', value: 1.5, usedIn: 'DNS #9, SQ #36' },
  { group: 'Job level', key: 'changeoverL3', label: 'Changeover Time (Hrs), Level 3', value: 2.0, usedIn: 'DNS #9, SQ #36' },
  { group: 'Job level', key: 'wastageMetersL1', label: 'Wastage Meters, Level 1 changeover', value: 250, usedIn: 'DNS #16, SQ #46' },
  { group: 'Job level', key: 'wastageMetersL2', label: 'Wastage Meters, Level 2 changeover', value: 350, usedIn: 'DNS #16, SQ #46' },
  { group: 'Job level', key: 'wastageMetersL3', label: 'Wastage Meters, Level 3 changeover', value: 450, usedIn: 'DNS #16, SQ #46' },
  { group: 'Costs', key: 'labelLS', label: 'L+S, Label', value: 4, usedIn: 'DNS #10, SQ #35' },
  { group: 'Costs', key: 'otherLS', label: 'L+S, other item types', value: 1, usedIn: 'DNS #10, SQ #35' },
  { group: 'Costs', key: 'conversionPerHour', label: 'Conversion cost per hour', value: 2000, usedIn: 'Conversion Cost: DNS #11, SQ #42' },
  { group: 'Costs', key: 'wastageRunPer', label: 'Wastage: running meters per step', value: 2000, usedIn: 'Wastage Cost: DNS #18, SQ #48' },
  { group: 'Costs', key: 'wastageRunAdd', label: 'Wastage: meters added per step', value: 50, usedIn: 'Wastage Cost: DNS #18, SQ #48' },
  { group: 'Costs', key: 'wastageFactor', label: 'Wastage: material factor', value: 2, usedIn: 'Wastage Cost: DNS #18, SQ #48' },
  { group: 'Costs', key: 'wastageUplift', label: 'Wastage: uplift', value: 1.05, usedIn: 'Wastage Cost: DNS #18, SQ #48' },
  { group: 'Costs', key: 'inkRate', label: 'Ink rate', value: 3.5, usedIn: 'Ink Cost: DNS #17, SQ #38' },
  { group: 'Costs', key: 'weightFactor', label: 'Freight and packing: SQM factor (÷1000)', value: 158, usedIn: 'Freight Cost DNS #20, SQ #37; Packing Cost DNS #23, SQ #40' },
  { group: 'Costs', key: 'packingRate', label: 'Packing rate', value: 5, usedIn: 'Packing Cost: DNS #23, SQ #40' },
  { group: 'Rate', key: 'sleeveAddOn', label: 'Calculated Rate add-on for non-Label items', value: 0.025, usedIn: 'Calculated Rate: DNS #25, SQ #50' },
  { group: 'Rate', key: 'setMultiplier', label: 'Set? = Yes multiplier', value: 2, usedIn: 'Final Rate DNS #26, SQ #26; Total Value DNS #27' },
  { group: 'Rate', key: 'factorDivisor', label: 'Factor divisor', value: 1550, usedIn: 'Factor: DNS #28' },
  { group: 'Do not Send checks', key: 'minPaperWidth', label: 'Paper Width below this: Final Rate 0, red', value: 0.09, usedIn: 'DNS #26, #40' },
  { group: 'Do not Send checks', key: 'maxPaperWidth', label: 'Paper Width above this: Final Rate 0, red', value: 0.44, usedIn: 'DNS #26, #40' },
  { group: 'Do not Send checks', key: 'profitWarning', label: 'Profit + Overhead below this: yellow', value: 20, usedIn: 'DNS #32' },
  { group: 'Do not Send checks', key: 'labelArGapMin', label: 'Ar Gap below this (not Sleeve): red', value: 2.5, usedIn: 'DNS #34' },
  { group: 'Do not Send checks', key: 'labelArGapMax', label: 'Ar Gap above this (not Sleeve): red', value: 5, usedIn: 'DNS #34' },
  { group: 'Do not Send checks', key: 'sleeveArGapMin', label: 'Ar Gap below this (Sleeve): red', value: 0, usedIn: 'DNS #34' },
  { group: 'Do not Send checks', key: 'sleeveArGapMax', label: 'Ar Gap above this (Sleeve): red', value: 1, usedIn: 'DNS #34' },
  { group: 'Do not Send checks', key: 'runningMetersLow', label: 'Running Meters below this: yellow', value: 2000, usedIn: 'DNS #40' },
  { group: 'Do not Send checks', key: 'runningMetersHigh', label: 'Running Meters above this: yellow', value: 5000, usedIn: 'DNS #40' },
  { group: 'Do not Send checks', key: 'sleeveTotalValueRed', label: 'Sleeve Total Value below this: red', value: 15000, usedIn: 'DNS #41' },
  { group: 'Do not Send checks', key: 'totalValueYellow', label: 'Total Value below this: yellow', value: 7500, usedIn: 'DNS #41' },
]

export const DEFAULT_NUMBERS: QuotationNumbers = Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, f.value])) as unknown as QuotationNumbers

/* ── Lists ── */

/** A dropdown value; charge and freight values also carry the text the reports print (the SQL's CASE). */
export interface ListItem extends Choice {
  reportText?: string
}

export type ListKey =
  | 'dieCharges' | 'freights' | 'paymentTerms' | 'marketingPersons' | 'plateCharges' | 'proofingCharges' | 'gsts'
  | 'coatingTypes' | 'materials' | 'valueAdditions' | 'deliveryZones'

export type QuotationLists = Record<ListKey, ListItem[]>

const withReport = (choices: Choice[], report: Record<string, string>): ListItem[] =>
  choices.map((c) => ({ ...c, reportText: report[c.code] ?? '' }))

/** The lists, SAP's values; the charges carry the reports' CASE texts (a code the CASE does not name prints blank). */
export const DEFAULT_LISTS: QuotationLists = {
  dieCharges: withReport(DIE_CHARGES, {
    'Extra@15000': 'Extra @15000 per size', 'Extra@10000': 'Extra @10000 per size', 'Extra@2500': 'Extra @2500 per size',
    'Extra@2000': 'Extra @2000 per size', 'Extra@1500': 'Extra @1500 per size', Included: 'Included in rate', None: 'None',
  }),
  freights: withReport(FREIGHTS, { 'Inclu RoadT': 'Included in Rate (Road Transport)', 'Inclu RTrain': 'Included in Rate (Train)', 'To-PayB': 'To-Pay Basis' }),
  paymentTerms: PAYMENT_TERMS.map((c) => ({ ...c })),
  marketingPersons: MARKETING_PERSONS.map((c) => ({ ...c })),
  plateCharges: withReport(PLATE_CHARGES, {
    'Extra@2000': 'Extra @2000 per colour', 'Extra@1800': 'Extra @1800 per colour', 'Extra@1500': 'Extra @1500 per colour',
    'Extra@1200': 'Extra @1200 per colour', 'Extra@1000': 'Extra @1000 per colour', 'Extra@800': 'Extra @800 per colour',
    'Extra@600': 'Extra @600 per colour', Included: 'Included in Rate',
  }),
  proofingCharges: withReport(PROOFING_CHARGES, {
    'Extra@15000': 'Extra @15,000 per artwork', 'Extra@12000': 'Extra @12,000 per artwork', 'Extra@10000': 'Extra @10,000 per artwork', 'Extra@8000': 'Extra @8000 per artwork',
  }),
  gsts: GSTS.map((c) => ({ ...c })),
  coatingTypes: COATING_TYPES.map((c) => ({ ...c })),
  materials: MATERIALS.map((c) => ({ ...c })),
  valueAdditions: VALUE_ADDITIONS.map((c) => ({ ...c })),
  deliveryZones: DELIVERY_ZONES.map((c) => ({ ...c })),
}

export const LIST_FIELDS: { key: ListKey; label: string; reportText: boolean; locked: string[] }[] = [
  { key: 'dieCharges', label: 'DieCharge', reportText: true, locked: ['Included'] },
  { key: 'freights', label: 'Freight', reportText: true, locked: [] },
  { key: 'paymentTerms', label: 'Payment Tems', reportText: false, locked: [] },
  { key: 'marketingPersons', label: 'Marketing Person', reportText: false, locked: [] },
  { key: 'plateCharges', label: 'Plate Charge', reportText: true, locked: ['Included'] },
  { key: 'proofingCharges', label: 'Proofing Charge', reportText: true, locked: [] },
  { key: 'gsts', label: 'GST', reportText: false, locked: [] },
  { key: 'coatingTypes', label: 'Coating Type', reportText: false, locked: ['None'] },
  { key: 'materials', label: 'Material', reportText: false, locked: [] },
  { key: 'valueAdditions', label: 'Value Addition 1', reportText: false, locked: ['None', 'Rotary Screen', 'Gold Foil', 'Silver Foil'] },
  { key: 'deliveryZones', label: 'Delivery Zone', reportText: false, locked: ['North India', 'Central India', 'East India'] },
]

/* ── Sales Quotation texts ── */

export interface QuotationTexts {
  letterhead: string[]
  deliveryLocation: string
  validity: string
  leadTime: string
  currency: string
  declaration: string[]
  computerGenerated: string
}

export const DEFAULT_TEXTS: QuotationTexts = {
  letterhead: [
    'Gujarat Print Pack Publications Pvt. Ltd.',
    '308,309,232 A & B,G.I.D.C. Estate,At Dediyasan,Mehsana - 384002 Gujarat India',
    'Contact Number : , Email : info@gujprintpack.com',
    'GSTIN : 24AAACG7781P1Z1, IEC CODE : 0894007882 , PAN : AAACG7781P ,',
    'CIN : U22210GJ1994PTC022238',
  ],
  deliveryLocation: 'Gujarat',
  validity: '30 Days',
  leadTime: '12 Days',
  currency: 'INR',
  declaration: [
    'Declaration :',
    " Gujarat Print Pack Publication's liability in case of a genuine defect in the product is limited to the billing amount of our product or free replacement.",
    ' We cannot assume liability for any losses caused to the client as a result of the defect or due to delays in supply. ',
    ' All legal matters subject to Mehsana jurisdiction. ',
  ],
  computerGenerated: 'This is a Computer Generated Document  It Does Not Require a Signature.',
}

/* ── The whole setting ── */

export interface QuotationConfig {
  numbers: QuotationNumbers
  lists: QuotationLists
  texts: QuotationTexts
  updatedAt: string | null
  updatedBy: string | null
}

export const DEFAULT_QUOTATION_CONFIG: QuotationConfig = { numbers: DEFAULT_NUMBERS, lists: DEFAULT_LISTS, texts: DEFAULT_TEXTS, updatedAt: null, updatedBy: null }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** A saved setting made whole and safe: missing or broken parts fall back to SAP's values; locked codes are always there. */
export function resolveQuotationConfig(saved: unknown): QuotationConfig {
  const s = (saved ?? {}) as Partial<{ numbers: Record<string, unknown>; lists: Record<string, unknown>; texts: Record<string, unknown>; updatedAt: unknown; updatedBy: unknown }>
  const numbers = { ...DEFAULT_NUMBERS }
  for (const f of NUMBER_FIELDS) {
    const v = Number(s.numbers?.[f.key])
    if (s.numbers && f.key in s.numbers && Number.isFinite(v)) numbers[f.key] = v
  }
  const lists = {} as QuotationLists
  for (const f of LIST_FIELDS) {
    const raw = s.lists?.[f.key]
    const items: ListItem[] = Array.isArray(raw)
      ? raw
          .map((r) => r as Record<string, unknown>)
          .map((r) => ({ code: str(r.code).trim(), description: str(r.description).trim() || str(r.code).trim(), ...(f.reportText ? { reportText: str(r.reportText) } : {}) }))
          .filter((r, i, all) => r.code && all.findIndex((x) => x.code === r.code) === i)
      : DEFAULT_LISTS[f.key].map((c) => ({ ...c }))
    // A code a formula needs is put back if it went missing.
    for (const code of f.locked) if (!items.some((i) => i.code === code)) items.push({ ...DEFAULT_LISTS[f.key].find((c) => c.code === code)! })
    lists[f.key] = items
  }
  const t = s.texts ?? {}
  const lines = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.map(str) : fallback)
  const texts: QuotationTexts = {
    letterhead: lines(t.letterhead, DEFAULT_TEXTS.letterhead),
    deliveryLocation: typeof t.deliveryLocation === 'string' ? t.deliveryLocation : DEFAULT_TEXTS.deliveryLocation,
    validity: typeof t.validity === 'string' ? t.validity : DEFAULT_TEXTS.validity,
    leadTime: typeof t.leadTime === 'string' ? t.leadTime : DEFAULT_TEXTS.leadTime,
    currency: typeof t.currency === 'string' ? t.currency : DEFAULT_TEXTS.currency,
    declaration: lines(t.declaration, DEFAULT_TEXTS.declaration),
    computerGenerated: typeof t.computerGenerated === 'string' ? t.computerGenerated : DEFAULT_TEXTS.computerGenerated,
  }
  return { numbers, lists, texts, updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : null, updatedBy: typeof s.updatedBy === 'string' ? s.updatedBy : null }
}

/** Why a setting cannot be saved, or null: numbers must be numbers, codes filled in and different. */
export function quotationConfigProblem(cfg: QuotationConfig): string | null {
  for (const f of NUMBER_FIELDS) if (!Number.isFinite(cfg.numbers[f.key])) return `${f.label} must be a number.`
  for (const f of LIST_FIELDS) {
    const codes = cfg.lists[f.key].map((i) => i.code.trim())
    if (codes.some((c) => !c)) return `${f.label}: every value needs a code.`
    const dup = codes.find((c, i) => codes.indexOf(c) !== i)
    if (dup) return `${f.label}: "${dup}" is in the list twice.`
    for (const code of f.locked) if (!codes.includes(code)) return `${f.label}: "${code}" is used by a formula and cannot be removed.`
  }
  return null
}

/** The report text of a charge or freight code; blank when the list does not have it (as the SQL CASE with no ELSE). */
export const reportTextOf = (items: ListItem[], code: string | null | undefined) => (code ? items.find((i) => i.code === code)?.reportText ?? '' : '')
