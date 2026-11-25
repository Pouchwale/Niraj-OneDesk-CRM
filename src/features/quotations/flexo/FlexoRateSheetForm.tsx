/**
 * Quotations → Quotation Sheet: the SAP form (Flexo Rate Sheet) as the page
 * itself (25 Nov 2026, the user's request: no pop-up, no sideways scrolling).
 * Header left: DocEntry, Date, Remark, DieCharge, Freight, Payment Tems,
 * Status. Header right: Customer, Marketing Person, Plate Charge, Proofing
 * Charge, GST, Delivery Location. Then one box per line with SAP's 22 fields
 * in SAP's order, wrapping onto rows, and Add (Update for a saved sheet) and
 * Cancel at the bottom, always in view. Only the layout changed; what is
 * saved, and every formula, is as before.
 */

import { useState } from 'react'
import { FilePlus2, FileSearch, FileText, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { demoCompanyStore } from '@/lib/demo-companies'
import { ITEM_TYPES, JOB_LEVELS, SETS, STATUSES, blankFlexoLine, type Choice, type FlexoRateLine, type FlexoRateSheet } from '@/lib/flexo-rate-sheet'
import type { QuotationLists } from '@/lib/quotation-config'
import { useQuotationConfig } from './useQuotationConfig'
import { whenSaved } from '@/lib/shared-data'
import { cn } from '@/lib/utils'
import type { QuotationReport } from './FlexoRateSheetsView'

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const selectClass = 'h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm'

function ChoiceSelect({ value, choices, onChange, label, className }: { value: string; choices: Choice[]; onChange: (v: string) => void; label: string; className?: string }) {
  // A value taken out of the list later still shows on the sheets that have it.
  const shown = value && !choices.some((c) => c.code === value) ? [...choices, { code: value, description: value }] : choices
  return (
    <select aria-label={label} className={cn(selectClass, className)} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" />
      {shown.map((c) => (
        <option key={c.code} value={c.code}>
          {c.description}
        </option>
      ))}
    </select>
  )
}

/** A number box: empty is "no value". */
function NumberBox({ value, onChange, label, step = 'any', className }: { value: number | null; onChange: (v: number | null) => void; label: string; step?: string; className?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      aria-label={label}
      className={cn('h-9 text-right tabular-nums', className)}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const t = e.target.value.trim()
        const n = Number(t)
        onChange(t === '' || !Number.isFinite(n) ? null : n)
      }}
    />
  )
}

/** One header field, label on the left as on the SAP screen. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

type LineKey = keyof FlexoRateLine
type Kind = 'text' | 'number' | 'rate' | Choice[] | keyof QuotationLists
/**
 * A line's fields in SAP's order, with SAP's labels. A list name is a list the
 * administrator keeps (Admin Panel). `wide` takes two places in a row.
 */
const FIELDS: { key: LineKey; label: string; kind: Kind; wide?: boolean }[] = [
  { key: 'jobName', label: 'Job Name', kind: 'text', wide: true },
  { key: 'netContent', label: 'Net Content', kind: 'text' },
  { key: 'finalRate', label: 'Final Rate', kind: 'rate' },
  { key: 'cutLength', label: 'Length/Cut Length', kind: 'number' },
  { key: 'width', label: 'Width/Open Size', kind: 'number' },
  { key: 'layFlatWidth', label: 'Lay Flat Width', kind: 'number' },
  { key: 'acrossUps', label: 'Across Ups', kind: 'number' },
  { key: 'aroundUps', label: 'Around Ups', kind: 'number' },
  { key: 'acrossGap', label: 'Across Gap', kind: 'number' },
  { key: 'moq', label: 'MOQ 1', kind: 'number' },
  { key: 'teeth', label: 'Teeth', kind: 'number' },
  { key: 'set', label: 'Set?', kind: SETS },
  { key: 'colors', label: 'Colors', kind: 'number' },
  { key: 'coatingType', label: 'Coating Type', kind: 'coatingTypes' },
  { key: 'material', label: 'Material', kind: 'materials' },
  { key: 'valueAddition', label: 'Value Addition 1', kind: 'valueAdditions' },
  { key: 'inkCoverageArea', label: 'Ink Coverage Area', kind: 'number' },
  { key: 'valueAddCoverageArea', label: 'Value Add Coverage Area', kind: 'number' },
  { key: 'deliveryZone', label: 'Delivery Zone', kind: 'deliveryZones', wide: true },
  { key: 'jobLevel', label: 'Job Level', kind: JOB_LEVELS },
  { key: 'itemType', label: 'Item Type', kind: ITEM_TYPES },
  { key: 'profitOverhead', label: 'Profit + Overhead', kind: 'number' },
]

/** A line nobody has typed anything into, which SAP would not save either. */
const isBlankLine = (l: FlexoRateLine) => {
  const blank = blankFlexoLine(l.id)
  return FIELDS.every((c) => (c.key === 'finalRate' ? !l.finalRate : l[c.key] === blank[c.key] || l[c.key] === null || l[c.key] === ''))
}

export function FlexoRateSheetForm({
  sheet,
  currentUserId,
  onSaved,
  onCancel,
  onOpenReport,
}: {
  /** The saved sheet being changed, or null for a new one. */
  sheet: FlexoRateSheet | null
  currentUserId: string
  onSaved: (saved: FlexoRateSheet | undefined, isNew: boolean) => void
  /** Cancel: a new sheet is emptied; a saved one is put away. */
  onCancel: () => void
  onOpenReport: (docEntry: number, report: QuotationReport) => void
}) {
  const [form, setForm] = useState(() => ({
    date: sheet?.date ?? '',
    remark: sheet?.remark ?? '',
    dieCharge: sheet?.dieCharge ?? '',
    freight: sheet?.freight ?? '',
    paymentTerms: sheet?.paymentTerms ?? '',
    status: sheet?.status ?? 'Pending',
    customer: sheet?.customer ?? '',
    marketingPerson: sheet?.marketingPerson ?? '',
    plateCharge: sheet?.plateCharge ?? '',
    proofingCharge: sheet?.proofingCharge ?? '',
    gst: sheet?.gst ?? '',
    deliveryLocation: sheet?.deliveryLocation ?? '',
  }))
  const [lines, setLines] = useState<FlexoRateLine[]>(() => (sheet?.lines.length ? sheet.lines.map((l) => ({ ...l })) : [blankFlexoLine(newId('line'))]))
  const [saving, setSaving] = useState(false)
  const cfg = useQuotationConfig()
  const choicesOf = (kind: Kind): Choice[] | null => (Array.isArray(kind) ? kind : kind in cfg.lists ? cfg.lists[kind as keyof QuotationLists] : null)
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const setLine = (id: string, patch: Partial<FlexoRateLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const save = async () => {
    const kept = lines.filter((l) => !isBlankLine(l))
    if (!form.customer.trim() && kept.length === 0) {
      toast.error('Fill in the sheet before adding it.', { description: 'There is no customer and no line.' })
      return
    }
    const now = new Date().toISOString()
    const record: FlexoRateSheet = {
      id: sheet?.id ?? newId('flexo'),
      // The store gives a new sheet its number; a saved one keeps its own.
      docEntry: sheet?.docEntry ?? 0,
      ...form,
      date: form.date || null,
      customer: form.customer.trim(),
      remark: form.remark,
      deliveryLocation: form.deliveryLocation.trim(),
      lines: kept,
      coordinator_id: sheet?.coordinator_id ?? currentUserId,
      created_at: sheet?.created_at ?? now,
      created_by: sheet?.created_by ?? currentUserId,
      updated_at: now,
      updated_by: currentUserId,
    }
    setSaving(true)
    try {
      demoCompanyStore.saveFlexoRateSheet(record)
      await whenSaved()
      onSaved(demoCompanyStore.getFlexoRateSheets().find((s) => s.id === record.id), !sheet)
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    // Not clipped (overflow-visible), so the Add / Cancel bar can stay in view as the page scrolls.
    <GlassCard className="overflow-visible p-0" data-testid="flexo-form">
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold" data-testid="flexo-form-title">{sheet ? `Quotation Sheet ${sheet.docEntry}` : 'New quotation sheet'}</h3>
            <p className="text-xs text-muted-foreground">
              {sheet ? 'Change it and press Update. Its two reports are on the right.' : 'Fill in the sheet and press Add. It then appears in the list below with its two reports.'}
            </p>
          </div>
          {sheet && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenReport(sheet.docEntry, 'do-not-send')} data-testid="flexo-form-dns">
                <FileSearch className="mr-1.5 h-4 w-4" /> Do not Send
              </Button>
              <Button size="sm" onClick={() => onOpenReport(sheet.docEntry, 'sales-quotation')} data-testid="flexo-form-sq">
                <FileText className="mr-1.5 h-4 w-4" /> Sales Quotation
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel} data-testid="flexo-form-new">
                <FilePlus2 className="mr-1.5 h-4 w-4" /> New sheet
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-x-10 gap-y-2.5 lg:grid-cols-2">
          <div className="space-y-2.5">
            <Field label="DocEntry">
              <Input className="h-9 bg-muted text-muted-foreground" value={sheet?.docEntry ? String(sheet.docEntry) : ''} placeholder="Given when added" readOnly tabIndex={-1} data-testid="flexo-docentry" />
            </Field>
            <Field label="Date">
              <Input type="date" aria-label="Date" className="h-9" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label="Remark">
              <Input aria-label="Remark" className="h-9" value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
            </Field>
            <Field label="DieCharge">
              <ChoiceSelect label="DieCharge" value={form.dieCharge} choices={cfg.lists.dieCharges} onChange={(v) => set({ dieCharge: v })} />
            </Field>
            <Field label="Freight">
              <ChoiceSelect label="Freight" value={form.freight} choices={cfg.lists.freights} onChange={(v) => set({ freight: v })} />
            </Field>
            <Field label="Payment Tems">
              <ChoiceSelect label="Payment Tems" value={form.paymentTerms} choices={cfg.lists.paymentTerms} onChange={(v) => set({ paymentTerms: v })} />
            </Field>
            <Field label="Status">
              <ChoiceSelect label="Status" value={form.status} choices={STATUSES} onChange={(v) => set({ status: v })} />
            </Field>
          </div>
          <div className="space-y-2.5">
            <Field label="Customer">
              <Input aria-label="Customer" className="h-9" value={form.customer} onChange={(e) => set({ customer: e.target.value })} data-testid="flexo-customer" />
            </Field>
            <Field label="Marketing Person">
              <ChoiceSelect label="Marketing Person" value={form.marketingPerson} choices={cfg.lists.marketingPersons} onChange={(v) => set({ marketingPerson: v })} />
            </Field>
            <Field label="Plate Charge">
              <ChoiceSelect label="Plate Charge" value={form.plateCharge} choices={cfg.lists.plateCharges} onChange={(v) => set({ plateCharge: v })} />
            </Field>
            <Field label="Proofing Charge">
              <ChoiceSelect label="Proofing Charge" value={form.proofingCharge} choices={cfg.lists.proofingCharges} onChange={(v) => set({ proofingCharge: v })} />
            </Field>
            <Field label="GST">
              <ChoiceSelect label="GST" value={form.gst} choices={cfg.lists.gsts} onChange={(v) => set({ gst: v })} />
            </Field>
            <Field label="Delivery Location">
              <Input aria-label="Delivery Location" className="h-9" value={form.deliveryLocation} onChange={(e) => set({ deliveryLocation: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="space-y-3" data-testid="flexo-grid">
          <h4 className="text-sm font-semibold">Lines</h4>
          {lines.map((l, i) => (
            <div key={l.id} className="rounded-lg border border-border bg-background/40" data-testid="flexo-line">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
                <span className="text-sm font-medium">
                  # {i + 1}
                  {l.jobName ? <span className="ml-2 font-normal text-muted-foreground">{l.jobName}</span> : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : [blankFlexoLine(newId('line'))]))}
                  data-testid="flexo-remove-line"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove line
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {FIELDS.map((c) => (
                  // The whole SAP name always shows (a long one wraps); the boxes stay lined up at the bottom.
                  <label key={c.key} className={cn('flex min-w-0 flex-col justify-end gap-1', c.wide && 'col-span-2')}>
                    <span className="block text-xs leading-tight text-muted-foreground">{c.label}</span>
                    {choicesOf(c.kind) ? (
                      <ChoiceSelect label={`${c.label}, line ${i + 1}`} value={(l[c.key] as string) ?? ''} choices={choicesOf(c.kind)!} onChange={(v) => setLine(l.id, { [c.key]: v })} />
                    ) : c.kind === 'text' ? (
                      <Input aria-label={`${c.label}, line ${i + 1}`} className="h-9" value={(l[c.key] as string) ?? ''} onChange={(e) => setLine(l.id, { [c.key]: e.target.value })} />
                    ) : (
                      <NumberBox
                        label={`${c.label}, line ${i + 1}`}
                        step={c.kind === 'rate' ? '0.00001' : 'any'}
                        value={l[c.key] as number | null}
                        onChange={(v) => setLine(l.id, { [c.key]: c.kind === 'rate' ? v ?? 0 : v })}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankFlexoLine(newId('line'))])} data-testid="flexo-add-line">
            <Plus className="mr-1.5 h-4 w-4" /> Add line
          </Button>
        </div>
      </div>

      {/* Add and Cancel stay in view while the sheet is long. */}
      <div className="sticky bottom-0 z-10 flex gap-2 rounded-b-xl border-t border-border bg-background px-4 py-3 shadow-[0_-6px_16px_-8px_rgba(0,0,0,0.15)] sm:px-6">
        <Button onClick={() => void save()} disabled={saving} data-testid="flexo-save">
          {sheet ? 'Update' : 'Add'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving} data-testid="flexo-cancel">
          Cancel
        </Button>
      </div>
    </GlassCard>
  )
}
