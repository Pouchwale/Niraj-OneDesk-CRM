/**
 * The one way a BP code is compared anywhere in the app.
 *
 * A customer arrives from three places - the Active Payments sheet, the ageing
 * report and the invoice ledger - and the code is typed slightly differently in
 * each: "bp-3002", "BP-3002 ", "BP-3002". Comparing the raw strings made the
 * same customer count twice on one screen and once on the next.
 */
export function normalizeBpCode(code: string | null | undefined): string | null {
  const trimmed = (code ?? '').trim().toUpperCase()
  return trimmed === '' ? null : trimmed
}

/** True when both sides carry a code and it is the same customer. */
export function sameBpCode(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeBpCode(a)
  return left !== null && left === normalizeBpCode(b)
}
