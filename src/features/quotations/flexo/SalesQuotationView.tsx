/**
 * Quotation Sheet → Sales Quotation: the customer's document, drawn exactly as
 * the user's sample (SalesQuotationPages). "Print / Save as PDF" opens the
 * print box with only these pages; choosing "Save as PDF" there gives the PDF.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import type { FlexoRateSheet } from '@/lib/flexo-rate-sheet'
import { salesQuotation } from '@/lib/sales-quotation'
import { SalesQuotationPages, printSalesQuotation } from './SalesQuotationPages'
import { useQuotationConfig } from './useQuotationConfig'

export function SalesQuotationView({ sheet }: { sheet: FlexoRateSheet }) {
  const { isAdmin } = useAuth()
  const rates = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.flexoRates)
  const cfg = useQuotationConfig()
  const doc = useMemo(() => salesQuotation(sheet, Object.fromEntries(rates.map((r) => [r.type, r.rate])), cfg), [sheet, rates, cfg])
  const [busy, setBusy] = useState(false)
  const blanks = doc.rows.filter((r) => !r.error && r.unitPrice === null)
  const errors = doc.rows.filter((r) => r.error)

  const print = async () => {
    setBusy(true)
    try {
      await printSalesQuotation(doc)
    } catch {
      toast.error('Could not open the print box. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void print()} disabled={busy} data-testid="sq-print">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          Print / Save as PDF
        </Button>
        <p className="text-xs text-muted-foreground">In the print box choose “Save as PDF” as the printer to save it.</p>
      </div>
      {(blanks.length > 0 || errors.length > 0) && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400" data-testid="sq-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {errors.length > 0 && `${errors.length} line${errors.length === 1 ? '' : 's'} cannot be worked out (${errors.map((r) => `SR ${r.srNo}: ${r.error}`).join('; ')}). `}
            {blanks.length > 0 &&
              // The rate table is the administrator's only, so coordinators are not pointed at it.
              `Unit Price is blank for SR ${blanks.map((r) => r.srNo).join(', ')}: a value it needs is empty, or a Type has no rate yet${isAdmin ? ' in the rate table' : ' (ask the administrator)'} (as in SAP, where it prints blank).`}
          </span>
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-neutral-200 p-4" data-testid="sales-quotation">
        <div className="mx-auto flex w-max flex-col gap-4 shadow-sm">
          <SalesQuotationPages doc={doc} />
        </div>
      </div>
    </div>
  )
}
