/**
 * Admin Panel → Quotation Sheet formulas (24 Nov 2026, the user's choice): an
 * index of every field and formula of the Do not Send and Sales Quotation
 * reports, and the numbers, dropdown lists and Sales Quotation texts the
 * administrator can change. The formulas keep SAP's shape; only the values in
 * them change. Saved for everyone; "Back to SAP values" undoes every change.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronRight, Lock, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useQuotationConfig } from '@/features/quotations/flexo/useQuotationConfig'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { rateTypes } from '@/lib/flexo-rate-sheet'
import {
  DEFAULT_NUMBERS, LIST_FIELDS, NUMBER_FIELDS, quotationConfigProblem,
  type ListKey, type QuotationConfig, type NumberKey,
} from '@/lib/quotation-config'
import { DO_NOT_SEND_COLOURS, DO_NOT_SEND_FORMULAS, DO_NOT_SEND_SQL, NULL_RULES, SALES_QUOTATION_FORMULAS, SALES_QUOTATION_LAYOUT, SALES_QUOTATION_SQL, SHEET_FIELDS, type FormulaEntry } from '@/lib/quotation-formula-index'
import { whenSaved } from '@/lib/shared-data'
import { cn } from '@/lib/utils'

type Tab = 'index' | 'numbers' | 'lists' | 'texts'
const TABS: { id: Tab; label: string }[] = [
  { id: 'index', label: 'Index' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'lists', label: 'Dropdown lists' },
  { id: 'texts', label: 'Sales Quotation texts' },
]

const clone = (c: QuotationConfig): QuotationConfig => JSON.parse(JSON.stringify(c))
const labelOf = (key: NumberKey) => NUMBER_FIELDS.find((f) => f.key === key)?.label ?? key

/** Which rate column of the SQL each list's Type fills (the LEFT JOINs on @RATED). */
const RATE_COLUMN: Record<string, string> = {
  'Coating Type': 'Coating Rate (T2)',
  Material: 'Materail Rate (T3)',
  'Value Addition': 'Valuadition Rate (T4)',
  'Delivery Zone': 'Diapcth Rate (T5)',
}

/** SAP's @RATED as held in the CRM (loaded from SAP 26 Nov 2026), one row per Type, sorted as SAP sorts it. */
function RateIndex() {
  const rates = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.flexoRates)
  const cfg = useQuotationConfig()
  const rows = useMemo(() => {
    const used = new Map(rateTypes(cfg.lists).map((t) => [t.type, t.usedFor]))
    const types = new Set([...used.keys(), ...rates.map((r) => r.type)])
    return [...types]
      // SAP's ORDER BY U_Type ignores capitals ("Sand Touch" before "SMI 22 GSM").
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .map((type) => {
        const held = rates.find((r) => r.type === type)
        return { type, rate: held?.rate ?? null, updatedAt: held?.updatedAt ?? null, usedFor: used.get(type) ?? [] }
      })
  }, [rates, cfg])
  const missing = rows.filter((r) => r.rate === null).length
  return (
    <div className="space-y-2" data-testid="rate-index">
      <h4 className="text-sm font-semibold">Rate table (SAP @RATED, {rows.length - missing} rates)</h4>
      <p className="text-xs text-muted-foreground">
        The SQL joins this table four times by Type: Coating Type → Coating Rate, Material → Materail Rate, Value Addition → Valuadition Rate, Delivery Zone → Diapcth Rate. Rates are changed in Quotations → Quotation Sheet → Rate table.
        {missing > 0 && <span className="font-medium text-amber-700 dark:text-amber-400"> {missing} Type{missing === 1 ? ' has' : 's have'} no rate.</span>}
      </p>
      <div className="overflow-x-auto rounded-md border border-border/60">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Type (U_Type)</th>
              <th className="px-2 py-2 text-right font-medium">Rate (U_Rate)</th>
              <th className="px-2 py-2 font-medium">Used as</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((r, i) => (
              <tr key={r.type} data-testid="rate-entry">
                <td className="px-2 py-1.5 tabular-nums">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium">{r.type}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.rate ?? <span className="text-amber-700 dark:text-amber-400">no rate</span>}</td>
                <td className="px-2 py-1.5">{r.usedFor.length ? r.usedFor.map((u) => RATE_COLUMN[u] ?? u).join(', ') : 'Not in a dropdown list'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FormulaList({ title, entries, cfg }: { title: string; entries: FormulaEntry[]; cfg: QuotationConfig }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="divide-y divide-border/60 rounded-md border border-border/60">
        {entries.map((f) => (
          <div key={`${title}${f.no}${f.name}`} className="grid gap-2 p-3 text-xs lg:grid-cols-[150px_minmax(0,1fr)_minmax(0,0.8fr)]" data-testid="formula-entry">
            <div>
              <p className="font-mono font-semibold">{f.no}</p>
              <p className="font-medium">{f.name}</p>
              <p className="text-muted-foreground">{f.result}</p>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[11px] leading-snug">{f.formula}</pre>
            <div className="space-y-1">
              <p>{f.plain}</p>
              {f.numbers.length > 0 && (
                <p className="text-muted-foreground">
                  Changeable:{' '}
                  {f.numbers.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ', '}
                      {labelOf(k)} = <b className={cn('tabular-nums', cfg.numbers[k] !== DEFAULT_NUMBERS[k] && 'text-amber-700 dark:text-amber-400')}>{cfg.numbers[k]}</b>
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function QuotationFormulasCard({ userId }: { userId: string }) {
  const saved = useQuotationConfig()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('index')
  const [draft, setDraft] = useState<QuotationConfig>(() => clone(saved))
  const [list, setList] = useState<ListKey>('materials')
  const [saving, setSaving] = useState(false)
  // Someone else's save comes in: start again from it, unless there are changes being typed.
  const savedKey = JSON.stringify(saved)
  const changed = JSON.stringify(draft) !== savedKey
  useEffect(() => {
    if (!changed) setDraft(clone(saved))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])
  const problem = useMemo(() => quotationConfigProblem(draft), [draft])
  const listField = LIST_FIELDS.find((f) => f.key === list)!

  const save = async (next: QuotationConfig | null) => {
    if (next && problem) {
      toast.error('Not saved.', { description: problem })
      return
    }
    setSaving(true)
    try {
      demoCompanyStore.saveQuotationConfig(next, userId, new Date().toISOString())
      await whenSaved()
      toast.success(next ? 'Flexo Quotation Calculation settings saved.' : 'Back to SAP values.')
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }
  const setNumber = (key: NumberKey, text: string) => setDraft((d) => ({ ...d, numbers: { ...d.numbers, [key]: text.trim() === '' ? Number.NaN : Number(text) } }))
  const setListItems = (items: QuotationConfig['lists'][ListKey]) => setDraft((d) => ({ ...d, lists: { ...d.lists, [list]: items } }))
  const groups = [...new Set(NUMBER_FIELDS.map((f) => f.group))]

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="quotation-formulas-card">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((o) => !o)} data-testid="quotation-formulas-toggle">
        {open ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />}
        <span>
          <span className="block text-base font-semibold">Flexo Quotation Calculation formulas</span>
          <span className="block text-sm text-muted-foreground">
            Every field and formula of the Do not Send and Sales Quotation reports, numbered as in SAP, and the numbers, dropdown lists and texts you can change.
            {saved.updatedAt ? ` Last changed ${new Date(saved.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${saved.updatedBy ? ` by ${getCoordinatorDisplayName(saved.updatedBy)}` : ''}.` : ' Using SAP’s values.'}
          </span>
        </span>
      </button>

      {open && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn('rounded-md px-3 py-1.5 text-sm', tab === t.id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  data-testid={`qf-tab-${t.id}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab !== 'index' && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={saving || (!saved.updatedAt && !changed)} onClick={() => window.confirm('Put every number, list and text back to SAP’s values?') && void save(null)} data-testid="qf-reset">
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Back to SAP values
                </Button>
                <Button size="sm" variant="outline" disabled={saving || !changed} onClick={() => setDraft(clone(saved))}>
                  Undo changes
                </Button>
                <Button size="sm" disabled={saving || !changed || Boolean(problem)} onClick={() => void save(draft)} data-testid="qf-save">
                  <Save className="mr-1.5 h-4 w-4" /> Save
                </Button>
              </div>
            )}
          </div>
          {tab !== 'index' && problem && <p className="text-sm text-rose-600" data-testid="qf-problem">{problem}</p>}

          {tab === 'index' && (
            <div className="space-y-6" data-testid="qf-index">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Flexo Quotation Calculation fields</h4>
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 font-medium">#</th>
                        <th className="px-2 py-2 font-medium">Field</th>
                        <th className="px-2 py-2 font-medium">SAP field</th>
                        <th className="px-2 py-2 font-medium">Type</th>
                        <th className="px-2 py-2 font-medium">Do not Send</th>
                        <th className="px-2 py-2 font-medium">Sales Quotation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {SHEET_FIELDS.map((f) => (
                        <tr key={f.no} data-testid="field-entry">
                          <td className="px-2 py-1.5 tabular-nums">{f.no}</td>
                          <td className="px-2 py-1.5 font-medium">{f.label}</td>
                          <td className="px-2 py-1.5 font-mono">{f.sap || '—'}</td>
                          <td className="px-2 py-1.5">{f.type}</td>
                          <td className="px-2 py-1.5">{f.doNotSend}</td>
                          <td className="px-2 py-1.5">{f.salesQuotation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <p className="rounded-md border border-border/60 p-2"><b>Do not Send, empty values:</b> {NULL_RULES.doNotSend}</p>
                <p className="rounded-md border border-border/60 p-2"><b>Sales Quotation, empty values:</b> {NULL_RULES.salesQuotation}</p>
              </div>
              <FormulaList title={`Do not Send formulas (${DO_NOT_SEND_FORMULAS.length})`} entries={DO_NOT_SEND_FORMULAS} cfg={saved} />
              <div className="space-y-2" data-testid="dns-sql">
                <h4 className="text-sm font-semibold">Do not Send SQL (the four rates from @RATED and the footer texts)</h4>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/50 p-3 font-mono text-[11px] leading-snug">{DO_NOT_SEND_SQL}</pre>
              </div>
              <FormulaList title="Do not Send cell colours (report design, not in the formula list)" entries={DO_NOT_SEND_COLOURS} cfg={saved} />
              <RateIndex />
              <FormulaList title={`Sales Quotation formulas (${SALES_QUOTATION_FORMULAS.length})`} entries={SALES_QUOTATION_FORMULAS} cfg={saved} />
              <div className="space-y-2" data-testid="sq-sql">
                <h4 className="text-sm font-semibold">Sales Quotation SQL (the four rates from @RATED, the footer texts and the company logo)</h4>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/50 p-3 font-mono text-[11px] leading-snug">{SALES_QUOTATION_SQL}</pre>
              </div>
              <FormulaList title="Sales Quotation page layout (report design, not in the formula list)" entries={SALES_QUOTATION_LAYOUT} cfg={saved} />
            </div>
          )}

          {tab === 'numbers' && (
            <div className="space-y-5" data-testid="qf-numbers">
              <p className="text-xs text-muted-foreground">The numbers inside the formulas. SAP’s value is shown beside each; a changed one is highlighted. Both reports use them straight away once saved.</p>
              {groups.map((g) => (
                <div key={g} className="space-y-2">
                  <h4 className="text-sm font-semibold">{g}</h4>
                  <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                    {NUMBER_FIELDS.filter((f) => f.group === g).map((f) => {
                      const v = draft.numbers[f.key]
                      return (
                        <label key={f.key} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2 border-b border-border/40 pb-1.5 text-sm">
                          <span className="min-w-0">
                            <span className="block font-medium">{f.label}</span>
                            <span className="block text-[11px] text-muted-foreground">{f.usedIn} · SAP {f.value}</span>
                          </span>
                          <Input
                            type="number"
                            step="any"
                            aria-label={f.label}
                            className={cn('h-8 text-right tabular-nums', v !== f.value && 'border-amber-500 bg-amber-500/10')}
                            value={Number.isFinite(v) ? String(v) : ''}
                            onChange={(e) => setNumber(f.key, e.target.value)}
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'lists' && (
            <div className="space-y-3" data-testid="qf-lists">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">List</span>
                <select aria-label="List to change" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={list} onChange={(e) => setList(e.target.value as ListKey)}>
                  {LIST_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({draft.lists[f.key].length})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Code is what is saved on a sheet; Description is what the dropdown shows.
                {listField.reportText && ' Report text is what Do not Send and the Sales Quotation print (empty prints nothing, as SAP’s report does for a code it does not name).'}
                {listField.locked.length > 0 && ` Locked (a formula tests them by name): ${listField.locked.join(', ')}.`}
                {' '}Sheets that already use a removed value keep it.
              </p>
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">Code</th>
                      <th className="px-2 py-2 font-medium">Description</th>
                      {listField.reportText && <th className="px-2 py-2 font-medium">Report text</th>}
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {draft.lists[list].map((item, i) => {
                      const locked = listField.locked.includes(item.code)
                      const update = (patch: Partial<typeof item>) => setListItems(draft.lists[list].map((x, j) => (j === i ? { ...x, ...patch } : x)))
                      return (
                        <tr key={i} data-testid="qf-list-row">
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-1">
                              {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                              <Input aria-label={`Code ${i + 1}`} className="h-8" value={item.code} readOnly={locked} onChange={(e) => update({ code: e.target.value })} />
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            <Input aria-label={`Description ${i + 1}`} className="h-8" value={item.description} onChange={(e) => update({ description: e.target.value })} />
                          </td>
                          {listField.reportText && (
                            <td className="px-2 py-1">
                              <Input aria-label={`Report text ${i + 1}`} className="h-8" value={item.reportText ?? ''} onChange={(e) => update({ reportText: e.target.value })} />
                            </td>
                          )}
                          <td className="px-1 py-1">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={locked} title={locked ? 'Used by a formula' : 'Remove'} onClick={() => setListItems(draft.lists[list].filter((_, j) => j !== i))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setListItems([...draft.lists[list], { code: '', description: '', ...(listField.reportText ? { reportText: '' } : {}) }])} data-testid="qf-list-add">
                <Plus className="mr-1.5 h-4 w-4" /> Add value
              </Button>
            </div>
          )}

          {tab === 'texts' && (
            <div className="grid gap-4 md:grid-cols-2" data-testid="qf-texts">
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Letterhead (one line each)</span>
                <Textarea rows={5} value={draft.texts.letterhead.join('\n')} onChange={(e) => setDraft((d) => ({ ...d, texts: { ...d.texts, letterhead: e.target.value.split('\n') } }))} />
              </label>
              {([
                ['validity', 'Quotation Validity'],
                ['leadTime', 'Lead Time'],
                ['currency', 'Currency'],
                ['deliveryLocation', 'Delivery Location (the report prints this text, not the sheet’s field)'],
              ] as const).map(([key, label]) => (
                <label key={key} className="space-y-1 text-sm">
                  <span className="font-medium">{label}</span>
                  <Input aria-label={label} value={draft.texts[key]} onChange={(e) => setDraft((d) => ({ ...d, texts: { ...d.texts, [key]: e.target.value } }))} />
                </label>
              ))}
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Declaration (one line each; the spaces at the start are kept)</span>
                <Textarea rows={4} value={draft.texts.declaration.join('\n')} onChange={(e) => setDraft((d) => ({ ...d, texts: { ...d.texts, declaration: e.target.value.split('\n') } }))} />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Closing line</span>
                <Input value={draft.texts.computerGenerated} onChange={(e) => setDraft((d) => ({ ...d, texts: { ...d.texts, computerGenerated: e.target.value } }))} />
              </label>
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}
