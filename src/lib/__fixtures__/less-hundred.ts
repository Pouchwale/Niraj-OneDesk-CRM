/**
 * For the minus scoring tests: the old written figure less 100, worked on its
 * digits (no floating point), to check the minus figures against.
 * "62.5" → "-37.5", "100" → "0", "150.00" → "+50.00", "33.33%" → "-66.67%".
 */
export function lessHundred(old: string): string {
  const suffix = old.endsWith('%') ? '%' : ''
  const body = suffix ? old.slice(0, -1) : old
  const negative = body.startsWith('-')
  const [whole, frac = ''] = (negative ? body.slice(1) : body).split('.')
  const scaled = BigInt(whole + frac) * (negative ? -1n : 1n)
  const result = scaled - 100n * 10n ** BigInt(frac.length)
  let text = (result < 0n ? -result : result).toString().padStart(frac.length + 1, '0')
  if (frac.length) text = `${text.slice(0, -frac.length)}.${text.slice(-frac.length)}`
  return `${result < 0n ? '-' : result > 0n ? '+' : ''}${text}${suffix}`
}

/** Scores to sweep: every hundredth from -100 to 200, odd values with long decimals, and awkward halves. */
export function scoreSweep(): number[] {
  const values: number[] = []
  for (let k = -10000; k <= 20000; k++) values.push(k / 100)
  for (let i = 0; i < 5000; i++) values.push(Math.round(((i * 7919) % 30000) - 10000) / 100 + ((i * 104729) % 1000) / 100000)
  values.push(1.005, 1.45, 2.675, 8.345, 62.45, 3.125, 96.875, 66.66666666666667, 33.333333333333336, 99.95, 99.96, 99.994, 100.004, 0.05, -0.04, -12.45, 1e-9)
  return values
}
