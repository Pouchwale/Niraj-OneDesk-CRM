/**
 * Quotations → Quotation Sheet (24 Nov 2026; one page since 25 Nov; 27 Nov
 * 2026, the user's request: "complete page for quotation making", saved ones
 * under Saved reports "like we do in OTIF"). The page is the entry form only.
 * The top bar has Saved reports (the saved sheets, a coordinator's own,
 * newest first: Open loads one into the form, or go straight to its Do not
 * Send or Sales Quotation) and Rate table (SAP's @RATED), each in a window,
 * as OTIF's Saved reports is.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Eye, FileSearch, FileText, FolderOpen, Pencil, Search, Table2 } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { describe, type FlexoRateSheet } from '@/lib/flexo-rate-sheet'
import { cn, formatDate } from '@/lib/utils'
import { FlexoRateSheetForm } from './FlexoRateSheetForm'
import { RatesCard } from './DoNotSendView'
import { useQuotationConfig } from './useQuotationConfig'

export type QuotationReport = 'do-not-send' | 'sales-quotation'

export function FlexoRateSheetsView({ canManageTeam, currentUserId, onOpenReport }: { canManageTeam: boolean; currentUserId: string; onOpenReport: (docEntry: number, report: QuotationReport) => void }) {
  const sheets = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.flexoRateSheets)
  const { isAdmin } = useAuth()
  /** The saved sheet in the form, or null for a new one. */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Starts a fresh form after Add or Cancel. */
  const [fresh, setFresh] = useState(0)
  const [savedOpen, setSavedOpen] = useState(false)
  const [ratesOpen, setRatesOpen] = useState(false)
  const editing = editingId ? sheets.find((s) => s.id === editingId) ?? null : null

  const open = (s: FlexoRateSheet) => {
    setEditingId(s.id)
    setSavedOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const startNew = () => {
    setEditingId(null)
    setFresh((n) => n + 1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotation Sheet"
        subtitle={editing ? `Saved sheet ${editing.docEntry} · ${editing.customer || 'no customer'}` : "Fill in the sheet (SAP's Flexo Rate Sheet) and press Add; its Do not Send and Sales Quotation come from it."}
      >
        <Button variant="outline" size="sm" onClick={() => setSavedOpen(true)} data-testid="flexo-saved-list">
          <FolderOpen className="mr-2 h-4 w-4 text-sky-600" />
          Saved reports
          {sheets.length > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{sheets.length}</span>}
        </Button>
        {/* The rate table is the administrator's only (27 Nov 2026, the user's request). */}
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setRatesOpen(true)} data-testid="flexo-rates-open">
            <Table2 className="mr-2 h-4 w-4 text-emerald-600" />
            Rate table
          </Button>
        )}
      </PageHeader>

      <FlexoRateSheetForm
        key={editing ? editing.id : `new-${fresh}`}
        sheet={editing}
        currentUserId={currentUserId}
        onOpenReport={onOpenReport}
        // Once made, only the administrator and the team leader change a sheet; a coordinator sees it.
        readOnly={!!editing && !canManageTeam}
        onCancel={startNew}
        onSaved={(saved, isNew) => {
          if (isNew) {
            // As SAP does: after Add the form is empty for the next one; the sheet is in Saved reports with its two reports.
            toast.success(`Quotation sheet ${saved?.docEntry ?? ''} added.`, {
              description: 'It is in Saved reports.',
              action: saved?.docEntry ? { label: 'Sales Quotation', onClick: () => onOpenReport(saved.docEntry, 'sales-quotation') } : undefined,
            })
            startNew()
          } else {
            toast.success(`Quotation sheet ${saved?.docEntry ?? ''} updated.`)
          }
        }}
      />

      <SavedSheetsDialog open={savedOpen} onOpenChange={setSavedOpen} sheets={sheets} editingId={editingId} canManageTeam={canManageTeam} onOpen={open} onOpenReport={onOpenReport} />

      {isAdmin && (
        <Dialog open={ratesOpen} onOpenChange={setRatesOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Rate table</DialogTitle>
              <DialogDescription>SAP's @RATED: the rates the Do not Send and the Sales Quotation use.</DialogDescription>
            </DialogHeader>
            <RatesCard canManageTeam currentUserId={currentUserId} defaultOpen />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function SavedSheetsDialog({
  open,
  onOpenChange,
  sheets,
  editingId,
  canManageTeam,
  onOpen,
  onOpenReport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sheets: FlexoRateSheet[]
  editingId: string | null
  canManageTeam: boolean
  onOpen: (s: FlexoRateSheet) => void
  onOpenReport: (docEntry: number, report: QuotationReport) => void
}) {
  const [search, setSearch] = useState('')
  const cfg = useQuotationConfig()
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return sheets
      .filter((s) => !needle || [String(s.docEntry), s.customer, s.marketingPerson, s.remark, ...s.lines.map((l) => l.jobName)].some((v) => (v ?? '').toLowerCase().includes(needle)))
      // A DocEntry typed in full comes first, then the newest.
      .sort((a, b) => Number(String(b.docEntry) === needle) - Number(String(a.docEntry) === needle) || b.docEntry - a.docEntry)
  }, [sheets, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl" data-testid="flexo-sheets">
        <DialogHeader>
          <DialogTitle>Saved quotation sheets</DialogTitle>
          <DialogDescription>Open one to change it in the form, or go straight to its Do not Send or Sales Quotation.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="DocEntry (e.g. 5387), customer, job name, marketing person" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="flexo-saved-search" />
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {sheets.length === 0 ? 'No quotation sheets yet. Fill in the form and press Add.' : 'No quotation sheets match.'}
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="flexo-sheet-table">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">DocEntry</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Marketing Person</th>
                  <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">Lines</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Added by</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((s) => (
                  <tr key={s.id} className={cn('hover:bg-muted/30', s.id === editingId && 'bg-primary/5')} data-testid="flexo-sheet-row">
                    <td className="px-3 py-2 font-mono tabular-nums">{s.docEntry || '…'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{s.date ? formatDate(s.date) : '—'}</td>
                    <td className="px-3 py-2 font-medium">{s.customer || '—'}</td>
                    <td className="hidden px-3 py-2 lg:table-cell">{describe(cfg.lists.marketingPersons, s.marketingPerson) || '—'}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell">{s.lines.length}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={s.status === 'Approved' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : ''}>
                        {s.status || 'Pending'}
                      </Badge>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 lg:table-cell">{s.coordinator_id ? getCoordinatorDisplayName(s.coordinator_id) : '—'}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpen(s)} data-testid="flexo-open-sheet">
                          {canManageTeam ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />} {canManageTeam ? 'Open' : 'View'}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!s.docEntry} onClick={() => onOpenReport(s.docEntry, 'do-not-send')} data-testid="flexo-open-report">
                          <FileSearch className="mr-1.5 h-3.5 w-3.5" /> Do not Send
                        </Button>
                        <Button size="sm" className="h-7 text-xs" disabled={!s.docEntry} onClick={() => onOpenReport(s.docEntry, 'sales-quotation')} data-testid="flexo-open-sales">
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
      </DialogContent>
    </Dialog>
  )
}
