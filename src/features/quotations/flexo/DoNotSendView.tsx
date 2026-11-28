/**
 * Quotation Sheet → Do not Send: SAP's DO_NOT_SEND report for one sheet (the
 * report asks "Enter Number": the sheet's DocEntry). Laid out as the report:
 * Document No., Document Date, Marketing Person and Customer at the top; one
 * row per line with the report's 28 columns and its cell colours; the remarks;
 * then Freight, Plate Charge, Die Charge, Proofing Charge and GST. The figures
 * the report works out but hides can be shown, to check against SAP.
 * The rate table (SAP's @RATED, RatesCard) is the administrator's only; it
 * opens from the Quotation Sheet page.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Download, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { DNS_DECIMALS, dnsFixed, doNotSendReport, pmtDays, type BackColor, type DoNotSendFigures, type DoNotSendLine } from '@/lib/do-not-send'
import { downloadDoNotSendPdf } from './do-not-send-pdf'
import { rateTypes, type FlexoRateSheet } from '@/lib/flexo-rate-sheet'
import { whenSaved } from '@/lib/shared-data'
import { useQuotationConfig } from './useQuotationConfig'
import { cn, formatDate } from '@/lib/utils'

/* The hidden workings: up to 5 decimals (the full value in the tooltip). The report's own columns use SAP's printed decimals (DNS_DECIMALS). */
const show = (n: number | null | undefined, decimals = 5) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
const full = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
/** A report figure as SAP prints it (display only; the full value is in the tooltip). */
const sap = (f: DoNotSendFigures | null, key: keyof typeof DNS_DECIMALS) => dnsFixed(f?.[key], DNS_DECIMALS[key])

const colorClass = (c: BackColor | 'lime') => (c === 'red' ? 'bg-red-500 text-white' : c === 'yellow' ? 'bg-yellow-300 text-black' : c === 'lime' ? 'bg-[#00ff00] text-black' : '')

type Cell = { label: string; value: (r: DoNotSendLine, f: DoNotSendFigures | null) => string; raw?: (f: DoNotSendFigures | null) => number | null; color?: (r: DoNotSendLine) => BackColor | 'lime'; number?: boolean }
const n = (v: number | null) => (v === null ? '' : String(v))

/** The report's detail columns, in its order. */
const COLUMNS: Cell[] = [
  { label: 'Job Name', value: (r) => r.line.jobName },
  { label: 'Net Content', value: (r) => r.line.netContent },
  { label: 'Set ?', value: (r) => r.line.set, color: (r) => r.colors.set },
  { label: 'Length', value: (r) => n(r.line.cutLength), number: true },
  { label: 'Width', value: (r) => n(r.line.width), number: true },
  { label: 'MOQ', value: (r) => n(r.line.moq), number: true },
  { label: 'Teeth', value: (r) => n(r.line.teeth), number: true },
  { label: 'Ac Ups', value: (r) => n(r.line.acrossUps), number: true },
  { label: 'Ac Gap', value: (r) => n(r.line.acrossGap), number: true },
  { label: 'Ar Gap', value: (_, f) => sap(f, 'arGap'), raw: (f) => f?.arGap ?? null, color: (r) => r.colors.arGap, number: true },
  { label: 'Paper Width', value: (_, f) => sap(f, 'width'), raw: (f) => f?.width ?? null, color: (r) => r.colors.width, number: true },
  { label: 'Running Meters', value: (_, f) => sap(f, 'runningMeters'), raw: (f) => f?.runningMeters ?? null, number: true },
  { label: 'Colors', value: (r) => n(r.line.colors), number: true },
  { label: 'Job Level', value: (r) => r.line.jobLevel, color: (r) => r.colors.jobLevel },
  { label: 'CoatingType', value: (r) => r.line.coatingType },
  { label: 'Value Add Area', value: (r) => n(r.line.valueAddCoverageArea), color: (r) => r.colors.valueAddArea, number: true },
  { label: 'Value Addition', value: (r) => r.line.valueAddition },
  { label: 'Material Type', value: (r) => r.line.material },
  { label: 'Ink Coverage Area', value: (r) => n(r.line.inkCoverageArea), number: true },
  { label: 'Dispatch Location', value: (r) => r.dispatchLocation },
  { label: 'Profit + Overhead', value: (r) => n(r.line.profitOverhead), color: (r) => r.colors.profitOverhead, number: true },
  { label: 'Pmt Days', value: () => '', number: true },
  { label: 'Final Rate', value: (_, f) => sap(f, 'finalRate'), raw: (f) => f?.finalRate ?? null, number: true },
  { label: 'Total Value', value: (_, f) => sap(f, 'totalValue'), raw: (f) => f?.totalValue ?? null, color: (r) => r.colors.totalValue, number: true },
  // Always green in SAP's report (a fixed colour, not a rule).
  { label: 'Factor', value: (_, f) => sap(f, 'factor'), raw: (f) => f?.factor ?? null, color: () => 'lime', number: true },
  { label: 'Price/SQM', value: (_, f) => sap(f, 'pricePerSqm'), raw: (f) => f?.pricePerSqm ?? null, number: true },
  { label: 'RM Price/SQM', value: (_, f) => sap(f, 'rmPricePerSqm'), raw: (f) => f?.rmPricePerSqm ?? null, number: true },
  { label: 'Cons Price/SQM', value: (_, f) => sap(f, 'consPricePerSqm'), raw: (f) => f?.consPricePerSqm ?? null, number: true },
]

/** Worked out by the report but not printed (suppressed fields). */
const HIDDEN: { label: string; key: keyof DoNotSendFigures }[] = [
  { label: 'SQM Per Label', key: 'sqmPerLabel' },
  { label: 'L + Waste', key: 'lWaste' },
  { label: 'W + Waste', key: 'wWaste' },
  { label: 'Print Speed', key: 'printSpeed' },
  { label: 'Changeover Time (Hrs)', key: 'changeoverTime' },
  { label: 'Conversion Cost', key: 'conversionCost' },
  { label: 'SQM Conversion', key: 'sqmConversion' },
  { label: 'Coating Cost', key: 'coatingCost' },
  { label: 'Material Cost', key: 'materialCost' },
  { label: 'Value Add Cost', key: 'valueAddCost' },
  { label: 'Wastage Meters', key: 'wastageMeters' },
  { label: 'Wastage Cost', key: 'wastageCost' },
  { label: 'Ink Cost', key: 'inkCost' },
  { label: 'Freight Cost', key: 'freightCost' },
  { label: 'Packing Cost', key: 'packingCost' },
  { label: 'Total Cost', key: 'totalCost' },
  { label: 'Profit Cost', key: 'profitCost' },
  { label: 'Payment Penalty / Benifit', key: 'paymentPenBen' },
  { label: 'Calculated Rate', key: 'calculatedRate' },
]

export function RatesCard({ canManageTeam, currentUserId, defaultOpen = false }: { canManageTeam: boolean; currentUserId: string; defaultOpen?: boolean }) {
  const rates = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.flexoRates)
  const [open, setOpen] = useState(defaultOpen)
  const cfg = useQuotationConfig()
  const types = useMemo(() => {
    const known = rateTypes(cfg.lists)
    const extra = rates.filter((r) => !known.some((k) => k.type === r.type)).map((r) => ({ type: r.type, usedFor: ['(not in a list)'] }))
    return [...known, ...extra]
  }, [rates, cfg])
  const save = async (type: string, text: string) => {
    const t = text.trim()
    const value = t === '' ? null : Number(t)
    if (value !== null && !Number.isFinite(value)) {
      toast.error('Enter a number.')
      return
    }
    const held = rates.find((r) => r.type === type)?.rate ?? null
    if (value === held) return
    try {
      demoCompanyStore.setFlexoRate(type, value, currentUserId, new Date().toISOString())
      await whenSaved()
    } catch (err) {
      toast.error('Rate not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }
  const missing = types.filter((t) => !rates.some((r) => r.type === t.type)).length
  return (
    <GlassCard className="space-y-3 p-4 sm:p-6" data-testid="flexo-rates">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((o) => !o)} data-testid="flexo-rates-toggle">
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>
        <span className="block text-base font-medium">Rate table</span>
        <span className="block text-xs text-muted-foreground">
          SAP's @RATED table: one rate per Type, used for Coating Rate, Materail Rate, Valuadition Rate and Diapcth Rate. With no rate, Do not Send counts 0 and the Sales Quotation's Unit Price is blank, as in SAP.
          {canManageTeam ? ' Type a rate and press Tab to save it.' : ' Only the team leader and the administrator can change them.'}
          {missing > 0 && <span className="font-medium text-amber-700 dark:text-amber-400"> {missing} of {types.length} have no rate yet.</span>}
        </span>
        </span>
      </button>
      {open && (
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {types.map((t) => {
          const held = rates.find((r) => r.type === t.type)?.rate
          return (
            <label key={t.type} className="flex items-center justify-between gap-2 border-b border-border/40 py-1 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.type}</span>
                <span className="block text-[11px] text-muted-foreground">{t.usedFor.join(' · ')}</span>
              </span>
              <Input
                key={`${t.type}-${held ?? ''}`}
                type="number"
                step="any"
                aria-label={`Rate for ${t.type}`}
                className="h-8 w-28 text-right tabular-nums"
                defaultValue={held ?? ''}
                placeholder="0"
                readOnly={!canManageTeam}
                onBlur={(e) => canManageTeam && void save(t.type, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </label>
          )
        })}
      </div>
      )}
    </GlassCard>
  )
}

export function DoNotSendView({ sheet }: { sheet: FlexoRateSheet }) {
  const rates = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.flexoRates)
  const [workings, setWorkings] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const cfg = useQuotationConfig()
  const rateTable = useMemo(() => Object.fromEntries(rates.map((r) => [r.type, r.rate])), [rates])
  const report = useMemo(() => doNotSendReport(sheet, rateTable, cfg), [sheet, rateTable, cfg])

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="do-not-send">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setWorkings((w) => !w)} data-testid="dns-workings">
            {workings ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {workings ? 'Hide workings' : 'Show hidden workings'}
          </Button>
          <Button
            type="button"
            disabled={downloading || !report || report.lines.length === 0 || report.lines.some((r) => r.error)}
            title={report?.lines.some((r) => r.error) ? 'A line cannot be worked out, so SAP would not print this report. Fix the line first.' : undefined}
            onClick={async () => {
              setDownloading(true)
              try {
                await downloadDoNotSendPdf(report)
              } catch (err) {
                toast.error('PDF not made.', { description: err instanceof Error ? err.message : 'Try again.' })
              } finally {
                setDownloading(false)
              }
            }}
            data-testid="dns-download-pdf"
          >
            <Download className="mr-2 h-4 w-4" /> {downloading ? 'Making PDF…' : 'Download PDF'}
          </Button>
        </div>

        {report && (
          <div className="space-y-4">
            <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2" data-testid="dns-header">
              <p><span className="text-muted-foreground">Document No.</span> <span className="ml-2 font-semibold tabular-nums">{report.sheet.docEntry}</span></p>
              <p><span className="text-muted-foreground">Document Date</span> <span className="ml-2 font-semibold">{report.sheet.date ? formatDate(report.sheet.date) : ''}</span></p>
              <p><span className="text-muted-foreground">Marketing Person</span> <span className="ml-2 font-semibold">{report.sheet.marketingPerson}</span></p>
              <p className="font-semibold">{report.sheet.customer}</p>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="text-xs" data-testid="dns-table">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.label} className={cn('whitespace-nowrap px-2 py-2 font-medium', c.number ? 'text-right' : 'text-left')}>
                        {c.label}
                      </th>
                    ))}
                    {workings && HIDDEN.map((h) => (
                      <th key={h.key} className="whitespace-nowrap bg-muted px-2 py-2 text-right font-medium italic">
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {report.lines.map((r) => (
                    <tr key={r.line.id} data-testid="dns-row">
                      {COLUMNS.map((c) => (
                        <td
                          key={c.label}
                          className={cn('whitespace-nowrap px-2 py-1.5', c.number && 'text-right tabular-nums', c.color && colorClass(c.color(r)))}
                          title={c.raw ? full(c.raw(r.figures)) : undefined}
                        >
                          {c.label === 'Pmt Days' ? pmtDays(report.sheet.paymentTerms) : c.value(r, r.figures)}
                        </td>
                      ))}
                      {workings && HIDDEN.map((h) => (
                        <td key={h.key} className="whitespace-nowrap bg-muted/30 px-2 py-1.5 text-right tabular-nums" title={full(r.figures?.[h.key])}>
                          {show(r.figures?.[h.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.lines.some((r) => r.error) && (
              <div className="space-y-1 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300" data-testid="dns-errors">
                {report.lines.map((r, i) =>
                  r.error ? (
                    <p key={r.line.id} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      Line {i + 1}{r.line.jobName ? ` (${r.line.jobName})` : ''}: {r.error}. SAP's report would stop here; fill it in on the Flexo Quotation Calculation.
                    </p>
                  ) : null
                )}
              </div>
            )}

            {/* SAP prints the remarks right-aligned in a yellow bar (a fixed colour). */}
            <p className="whitespace-pre-wrap bg-[#ffff00] px-2 py-0.5 text-right text-sm text-black" data-testid="dns-remark">{report.sheet.remark || ' '}</p>

            <div className="grid max-w-xl grid-cols-[160px_12px_minmax(0,1fr)] gap-y-1 text-sm" data-testid="dns-footer">
              <span className="text-muted-foreground">Freight</span><span>:</span><span>{report.footer.freight}</span>
              <span className="text-muted-foreground">Plate Charge</span><span>:</span><span className={cn('px-1', colorClass(report.footer.plateChargeColor))}>{report.footer.plateCharge}</span>
              <span className="text-muted-foreground">Die Charge</span><span>:</span><span className={cn('px-1', colorClass(report.footer.dieChargeColor))}>{report.footer.dieCharge}</span>
              <span className="text-muted-foreground">Proofing Charge</span><span>:</span><span>{report.footer.proofingCharge}</span>
              <span className="text-muted-foreground">GST Charge (Extra)</span><span>:</span><span>{report.footer.gst}</span>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
