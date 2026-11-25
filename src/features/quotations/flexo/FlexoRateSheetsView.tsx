/**
 * Quotations → Quotation Sheet (24 Nov 2026; one page since 25 Nov 2026): the
 * entry form opens straight away for a new sheet, and the saved sheets (a
 * coordinator's own) are listed under it, newest first. Opening one loads it
 * into the same form. Each saved sheet gives two reports from the same data:
 * Do not Send (the costing, not for the customer) and the Sales Quotation
 * (the customer's document).
 */

import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { FileSearch, FileText, Pencil, Search } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { describe, type FlexoRateSheet } from '@/lib/flexo-rate-sheet'
import { cn, formatDate } from '@/lib/utils'
import { FlexoRateSheetForm } from './FlexoRateSheetForm'
import { RatesCard } from './DoNotSendView'
import { useQuotationConfig } from './useQuotationConfig'

export type QuotationReport = 'do-not-send' | 'sales-quotation'

export function FlexoRateSheetsView({ canManageTeam, currentUserId, onOpenReport }: { canManageTeam: boolean; currentUserId: string; onOpenReport: (docEntry: number, report: QuotationReport) => void }) {
  const sheets = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.flexoRateSheets)
  /** The saved sheet in the form, or null for a new one. */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Starts a fresh form after Add or Cancel. */
  const [fresh, setFresh] = useState(0)
  const [search, setSearch] = useState('')
  const cfg = useQuotationConfig()
  const top = useRef<HTMLDivElement>(null)
  const editing = editingId ? sheets.find((s) => s.id === editingId) ?? null : null
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return sheets
      .filter((s) => !needle || [String(s.docEntry), s.customer, s.marketingPerson, s.remark, ...s.lines.map((l) => l.jobName)].some((v) => (v ?? '').toLowerCase().includes(needle)))
      .sort((a, b) => b.docEntry - a.docEntry)
  }, [sheets, search])

  const open = (s: FlexoRateSheet) => {
    setEditingId(s.id)
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const startNew = () => {
    setEditingId(null)
    setFresh((n) => n + 1)
  }

  return (
    <div className="space-y-6">
      <div ref={top} className="scroll-mt-4">
        <FlexoRateSheetForm
          key={editing ? editing.id : `new-${fresh}`}
          sheet={editing}
          currentUserId={currentUserId}
          onOpenReport={onOpenReport}
          onCancel={startNew}
          onSaved={(saved, isNew) => {
            if (isNew) {
              // As SAP does: after Add the form is empty for the next one; the sheet is in the list with its reports.
              toast.success(`Quotation sheet ${saved?.docEntry ?? ''} added.`, {
                description: 'It is in the list below.',
                action: saved?.docEntry ? { label: 'Sales Quotation', onClick: () => onOpenReport(saved.docEntry, 'sales-quotation') } : undefined,
              })
              startNew()
            } else {
              toast.success(`Quotation sheet ${saved?.docEntry ?? ''} updated.`)
            }
          }}
        />
      </div>

      <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="flexo-sheets">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Saved quotation sheets</h3>
            <p className="text-xs text-muted-foreground">Open one to change it in the form above, or go straight to its Do not Send or Sales Quotation.</p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="DocEntry, customer, job name, marketing person" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {/* Kept as data-testid flexo-new for the new-sheet button the page used to have: it empties the form. */}
        <button type="button" className="sr-only" onClick={startNew} data-testid="flexo-new">New quotation sheet</button>

        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {sheets.length === 0 ? 'No quotation sheets yet. Fill in the form above and press Add.' : 'No quotation sheets match.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="flexo-sheet-table">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">DocEntry</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  {/* On a narrow screen these three step aside so the buttons always fit; the opened sheet shows them all. */}
                  <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Marketing Person</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium xl:table-cell">Lines</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  {canManageTeam && <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Added by</th>}
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((s) => (
                  <tr key={s.id} className={cn('cursor-pointer hover:bg-muted/30', s.id === editingId && 'bg-primary/5')} onClick={() => open(s)} data-testid="flexo-sheet-row">
                    <td className="px-4 py-2.5 font-mono tabular-nums">{s.docEntry || '…'}</td>
                    <td className="px-3 py-2.5">{s.date ? formatDate(s.date) : '—'}</td>
                    <td className="px-3 py-2.5 font-medium">{s.customer || '—'}</td>
                    <td className="hidden px-3 py-2.5 xl:table-cell">{describe(cfg.lists.marketingPersons, s.marketingPerson) || '—'}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums xl:table-cell">{s.lines.length}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={s.status === 'Approved' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : ''}>
                        {s.status || 'Pending'}
                      </Badge>
                    </td>
                    {canManageTeam && <td className="hidden whitespace-nowrap px-3 py-2.5 xl:table-cell">{s.coordinator_id ? getCoordinatorDisplayName(s.coordinator_id) : '—'}</td>}
                    <td className="px-3 py-2">
                      {/* The buttons wrap rather than push the list sideways. */}
                      <div className="flex flex-wrap justify-end gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); open(s) }} data-testid="flexo-open-sheet">
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Open
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={!s.docEntry}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenReport(s.docEntry, 'do-not-send')
                        }}
                        data-testid="flexo-open-report"
                      >
                        <FileSearch className="mr-1.5 h-3.5 w-3.5" /> Do not Send
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!s.docEntry}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenReport(s.docEntry, 'sales-quotation')
                        }}
                        data-testid="flexo-open-sales"
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" /> Sales Quotation
                      </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
      <RatesCard canManageTeam={canManageTeam} currentUserId={currentUserId} />
    </div>
  )
}
