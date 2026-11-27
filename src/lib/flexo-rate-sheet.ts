/**
 * Quotations → Flexo Rate Sheet (24 Nov 2026): the SAP Business One form, field
 * for field (database TEST 19112026, screens and dropdowns as the user sent
 * them). Every dropdown keeps SAP's Code (what is saved) and Description (what
 * shows), in SAP's order. Labels keep SAP's spelling, "Payment Tems" included.
 *
 * Pure, relative imports only: the server bundles the store, which uses this.
 */

export interface Choice {
  code: string
  description: string
}

const same = (...codes: string[]): Choice[] => codes.map((code) => ({ code, description: code }))

/* ── Header, left column ── */

export const DIE_CHARGES: Choice[] = [
  { code: 'Extra@15000', description: 'Extra @15000 per size' },
  { code: 'Extra@10000', description: 'Extra @10000 per size' },
  { code: 'Extra@2500', description: 'Extra @2500 per size' },
  { code: 'Extra@2000', description: 'Extra @2000 per size' },
  { code: 'Extra@1500', description: 'Extra @1500 per size' },
  { code: 'Included', description: 'Included in rate' },
  { code: 'None', description: 'None' },
]

export const FREIGHTS: Choice[] = [
  { code: 'Inclu RoadT', description: 'Included in Rate (Road Transport)' },
  { code: 'Inclu RTrain', description: 'Included in Rate (Train)' },
  { code: 'To-PayB', description: 'To-Pay Basis' },
]

export const PAYMENT_TERMS: Choice[] = same('100% Advance', 'Against PDC', '30 Days', '45 Days', '60 Days', '75 Days', '90 Days', '120 Days', '50% Advance')

export const STATUSES: Choice[] = same('Pending', 'Approved')

/* ── Header, right column ── */

export const MARKETING_PERSONS: Choice[] = same(
  'Jay', 'Sudhansh', 'Shail', 'Swarup', 'Yogeshwar', 'Niladri', 'Prismtech', 'Other', 'Prasenjit Banerji',
  'Ms. Pallavi', 'Atul Gupta', 'Jasraj', 'Niki Patel', 'Milan', 'Shailesh Prajapati', 'Ramanesh Nair'
)

export const PLATE_CHARGES: Choice[] = [
  { code: 'Extra@2000', description: 'Extra @2000 per colour' },
  { code: 'Extra@1800', description: 'Extra @1800 per colour' },
  { code: 'Extra@1500', description: 'Extra @1500 per colour' },
  { code: 'Extra@1200', description: 'Extra @1200 per colour' },
  { code: 'Extra@1000', description: 'Extra @1000 per colour' },
  { code: 'Extra@800', description: 'Extra @800 per colour' },
  { code: 'Extra@600', description: 'Extra @600 per colour' },
  { code: 'Included', description: 'Included in Rate' },
  { code: 'None', description: 'None' },
]

export const PROOFING_CHARGES: Choice[] = [
  { code: 'Extra@15000', description: 'Extra @15,000 per artwork' },
  { code: 'Extra@12000', description: 'Extra @12,000 per artwork' },
  { code: 'Extra@10000', description: 'Extra @10,000 per artwork' },
  { code: 'Extra@8000', description: 'Extra @8,000 per artwork' },
  { code: 'None', description: 'None' },
]

export const GSTS: Choice[] = same('Extra @ 18%', 'Extra @ 12%')

/* ── Line grid ── */

export const SETS: Choice[] = same('Yes', 'No')

export const COATING_TYPES: Choice[] = same(
  'Matt Lamination', 'Gloss Lamination', 'Gloss UV', 'Matt UV', 'High Scuff UV', 'Shrink Sleeve White',
  'Matt + Gloss UV', 'Texture (Drip Off)', 'Soft Touch Coating', 'Sand Touch Coating', 'None'
)

/** The 25 values the SAP screen showed (the list may go on below; see the open items). */
export const MATERIALS: Choice[] = same(
  '70 GSM Chromo', '60 GSM Chromo', '80 GSM Chromo', '75 GSM Chromo', 'PE Clear', 'PE White', 'PE Silver',
  'PP Clear', 'PP White', 'PP Silver', 'PP Silver (40 Micron)', 'Silver Metallized Chromo', 'Silver Metall INT',
  'Global MDO', 'Clear on Clear', 'Mirrorcoat', 'Holographic', 'SMI 27 GSM', 'SMI 22 GSM', '40 Micron PVC Blown',
  '40 Micron PVC Cast', '40 Micron PET', '50 Micron PVC Blown', '50 Micron PVC Cast', '50 Micron PET'
)

export const VALUE_ADDITIONS: Choice[] = same(
  'Cast and Cure', 'Silver Foil', 'Gold Foil', 'Hot Foil Stamping', 'Rotary Screen', 'Back Side Printing',
  'Micro Printing', 'None', 'Texture (Drip Off)'
)

export const DELIVERY_ZONES: Choice[] = [
  { code: 'Gujarat', description: 'Gujarat' },
  { code: 'Maharashtra', description: 'Maharashtra' },
  { code: 'North India', description: 'North India (Delhi, Himachal, Etc.)' },
  { code: 'Central India', description: 'Central India (M.P, etc.)' },
  { code: 'Export', description: 'Export' },
  { code: 'South India', description: 'South India' },
  // The SAP screen cut this one off after "Assam"; the Do not Send report writes "East India (Guwahati, Assam)".
  { code: 'East India', description: 'East India (Guwahati, Assam)' },
]

export const JOB_LEVELS: Choice[] = same('Level 1', 'Level 2', 'Level 3')

export const ITEM_TYPES: Choice[] = same('Label', 'Sleeve')

/** The description shown for a saved code, or the code itself when it is not in the list. */
export const describe = (choices: Choice[], code: string | null | undefined) =>
  code ? choices.find((c) => c.code === code)?.description ?? code : ''

/* ── The record ── */

/** One job on the sheet: a line of SAP's grid (@RATECALD). */
export interface FlexoRateLine {
  id: string
  jobName: string
  netContent: string
  /** Typed, five decimals in SAP (default 0.00000). */
  finalRate: number | null
  /** "Length/Cut Length", mm. */
  cutLength: number | null
  /** "Width/Open Size", mm. */
  width: number | null
  layFlatWidth: number | null
  acrossUps: number | null
  aroundUps: number | null
  acrossGap: number | null
  /** "MOQ 1". */
  moq: number | null
  teeth: number | null
  /** "Set?": Yes / No. */
  set: string
  colors: number | null
  coatingType: string
  material: string
  /** "Value Addition 1". */
  valueAddition: string
  inkCoverageArea: number | null
  valueAddCoverageArea: number | null
  deliveryZone: string
  jobLevel: string
  itemType: string
  /** "Profit + Overhead", percent. */
  profitOverhead: number | null
}

/** One Flexo Rate Sheet (SAP's @RATECALM), with its lines. */
export interface FlexoRateSheet {
  id: string
  /** SAP's DocEntry: given by the CRM when the sheet is first added, one more than the highest so far. */
  docEntry: number
  date: string | null
  remark: string
  dieCharge: string
  freight: string
  /** "Payment Tems" on the SAP screen. */
  paymentTerms: string
  status: string
  customer: string
  marketingPerson: string
  plateCharge: string
  proofingCharge: string
  gst: string
  deliveryLocation: string
  lines: FlexoRateLine[]
  /** Who keeps it: the person who added it. A coordinator sees only their own. */
  coordinator_id: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

/** A rate from SAP's @RATED table: one Type (a coating, material, value addition or delivery zone) and its Rate. */
export interface FlexoRate {
  type: string
  rate: number
  updatedAt: string
  updatedBy: string | null
}

export function blankFlexoLine(id: string): FlexoRateLine {
  return {
    id,
    jobName: '',
    netContent: '',
    finalRate: 0,
    cutLength: null,
    width: null,
    layFlatWidth: null,
    acrossUps: null,
    aroundUps: null,
    acrossGap: null,
    moq: null,
    teeth: null,
    set: '',
    colors: null,
    coatingType: '',
    material: '',
    valueAddition: '',
    inkCoverageArea: null,
    valueAddCoverageArea: null,
    deliveryZone: '',
    jobLevel: '',
    itemType: '',
    profitOverhead: null,
  }
}

/** The next DocEntry: one more than the highest in use. */
/** SAP's last Flexo Rate Sheet before the CRM took over: new sheets carry on from 5387 (27 Nov 2026, the user's request). */
export const SAP_LAST_DOCENTRY = 5386
export const nextDocEntry = (sheets: readonly { docEntry: number }[]) => sheets.reduce((m, s) => Math.max(m, s.docEntry || 0), SAP_LAST_DOCENTRY) + 1

/**
 * Every Type the rate table can hold, in the order the dropdowns list them.
 * SAP keeps all four in one table keyed by Type, so a name used in two lists
 * ("Texture (Drip Off)" is a coating and a value addition) has one rate.
 */
export function rateTypes(
  lists: { coatingTypes: Choice[]; materials: Choice[]; valueAdditions: Choice[]; deliveryZones: Choice[] } = {
    coatingTypes: COATING_TYPES,
    materials: MATERIALS,
    valueAdditions: VALUE_ADDITIONS,
    deliveryZones: DELIVERY_ZONES,
  }
): { type: string; usedFor: string[] }[] {
  const out = new Map<string, string[]>()
  const add = (choices: Choice[], usedFor: string) => {
    // "None" is a Type too: Sales Quotation needs a row for it (with none, its Unit Price is blank); Do not Send counts a missing one as 0.
    for (const c of choices) out.set(c.code, [...(out.get(c.code) ?? []), usedFor])
  }
  add(lists.coatingTypes, 'Coating Type')
  add(lists.materials, 'Material')
  add(lists.valueAdditions, 'Value Addition')
  add(lists.deliveryZones, 'Delivery Zone')
  return [...out].map(([type, usedFor]) => ({ type, usedFor }))
}
