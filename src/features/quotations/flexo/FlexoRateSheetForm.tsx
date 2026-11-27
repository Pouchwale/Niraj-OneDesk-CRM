/**
 * Quotations → Quotation Sheet: the SAP form (Flexo Rate Sheet) as the page
 * itself (25 Nov 2026, the user's request: no pop-up). Header left: DocEntry,
 * Date, Remark, DieCharge, Freight, Payment Tems, Status. Header right:
 * Customer, Marketing Person, Plate Charge, Proofing Charge, GST, Delivery
 * Location. Then the lines as SAP's grid (27 Nov 2026, FlexoLinesGrid: one row
 * per line, copy and paste as in SAP; only the grid scrolls sideways, the
 * user's choice), and Add (Update for a saved sheet) and Cancel at the bottom,
 * always in view. What is saved, and every formula, is as before.
 */

import { useState } from 'react'
import { FilePlus2, FileSearch, FileText } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { demoCompanyStore } from '@/lib/demo-companies'
import { isBlankLine, padLines } from '@/lib/flexo-grid'
import { STATUSES, type Choice, type FlexoRateLine, type FlexoRateSheet } from '@/lib/flexo-rate-sheet'
import { FlexoLinesGrid } from './FlexoLinesGrid'
import { useQuotationConfig } from './useQuotationConfig'
import { whenSaved } from '@/lib/shared-data'
import { cn } from '@/lib/utils'
import type { QuotationReport } from './FlexoRateSheetsView'

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
// SAP-sized header fields, so the lines grid gets the page.
const selectClass = 'h-7 w-full min-w-0 rounded border border-border bg-background px-1.5 text-xs'

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

/** One header field, label on the left as on the SAP screen. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 text-xs sm:grid-cols-[130px_minmax(0,1fr)]">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function FlexoRateSheetForm({
  sheet,
  currentUserId,
  onSaved,
  onCancel,
  onOpenReport,
  readOnly = false,
}: {
  /** Someone else's saved sheet opened by a coordinator: shown, not changed (a coordinator changes only the sheets they made, 27 Nov 2026). */
  readOnly?: boolean
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
  const [lines, setLines] = useState<FlexoRateLine[]>(() => padLines(sheet?.lines.map((l) => ({ ...l })) ?? [], () => newId('line')))
  const [saving, setSaving] = useState(false)
  const cfg = useQuotationConfig()
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

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
      <div className="space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold" data-testid="flexo-form-title">{sheet ? `Quotation Sheet ${sheet.docEntry}` : 'New quotation sheet'}</h3>
            <p className="text-xs text-muted-foreground">
              {sheet ? (readOnly ? 'Someone else’s saved sheet: only they, the team leader or the administrator can change it; its two reports are on the right.' : 'Change it and press Update. Its two reports are on the right.') : 'Fill in the sheet and press Add. It then appears in Saved reports with its two reports.'}
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

        {/* A coordinator's saved sheet: every header field locked. */}
        <fieldset disabled={readOnly} className="grid gap-x-16 gap-y-1 disabled:opacity-90 lg:grid-cols-2">
          <div className="space-y-1">
            <Field label="DocEntry">
              <Input className="h-7 rounded bg-muted px-1.5 text-xs text-muted-foreground" value={sheet?.docEntry ? String(sheet.docEntry) : ''} placeholder="Given when added" readOnly tabIndex={-1} data-testid="flexo-docentry" />
            </Field>
            <Field label="Date">
              <Input type="date" aria-label="Date" className="h-7 rounded px-1.5 text-xs" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label="Remark">
              <Input aria-label="Remark" className="h-7 rounded px-1.5 text-xs" value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
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
          <div className="space-y-1">
            <Field label="Customer">
              <Input aria-label="Customer" className="h-7 rounded px-1.5 text-xs" value={form.customer} onChange={(e) => set({ customer: e.target.value })} data-testid="flexo-customer" />
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
              <Input aria-label="Delivery Location" className="h-7 rounded px-1.5 text-xs" value={form.deliveryLocation} onChange={(e) => set({ deliveryLocation: e.target.value })} />
            </Field>
          </div>
        </fieldset>

        <FlexoLinesGrid lines={lines} setLines={setLines} lists={cfg.lists} newId={() => newId('line')} readOnly={readOnly} />
      </div>

      {/* Add and Cancel stay in view while the sheet is long. */}
      <div className="sticky bottom-0 z-10 flex gap-2 rounded-b-xl border-t border-border bg-background px-4 py-3 shadow-[0_-6px_16px_-8px_rgba(0,0,0,0.15)] sm:px-6">
        {readOnly ? (
          // Nothing to save: back to an empty sheet, where copied rows can be pasted.
          <Button variant="outline" onClick={onCancel} data-testid="flexo-cancel">
            <FilePlus2 className="mr-1.5 h-4 w-4" /> New sheet
          </Button>
        ) : (
          <>
            <Button onClick={() => void save()} disabled={saving} data-testid="flexo-save">
              {sheet ? 'Update' : 'Add'}
            </Button>
            <Button variant="outline" onClick={onCancel} disabled={saving} data-testid="flexo-cancel">
              Cancel
            </Button>
          </>
        )}
      </div>
    </GlassCard>
  )
}
