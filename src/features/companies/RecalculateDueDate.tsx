import { useState } from 'react'
import { CalendarClock, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { updateCompany } from '@/lib/companies-api'
import { demoCompanyStore } from '@/lib/demo-companies'
import type { Company } from '@/lib/types'
import { recalculateDueDate, REFUSAL_MESSAGE } from '@/lib/due-date'
import { formatDate } from '@/lib/utils'

interface Props {
  company: Company
  /** Who is doing it, for the audit entry. */
  actorId?: string
  /** Called after the date changes, so the panel and the list catch up. */
  onChanged?: () => void
}

/**
 * Recomputing a due date from the invoice date and the credit period.
 *
 * The workbook's due date is used wherever it has one, and it is usually right.
 * It stops being right when an invoice date is corrected or terms are
 * renegotiated after the row was first written, and then an account sits in the
 * wrong week of the chase list with nothing on screen to explain why. This puts
 * the arithmetic where the coordinator already is — in the follow-up panel, on
 * the account they have open.
 *
 * It shows the answer before it applies it. Overwriting a date the file
 * supplied is a decision, and a button that silently moved money between weeks
 * would be the kind of help nobody asked for.
 *
 * Advance payment is refused by name. "Advance 50%" is not a credit period:
 * the money was due before delivery, so counting zero days from the invoice
 * date would mark the account overdue the morning after it was raised.
 */
export function RecalculateDueDate({ company, actorId, onChanged }: Props) {
  const [isSaving, setIsSaving] = useState(false)

  const result = recalculateDueDate(company.invoice_date, company.payment_terms, company.due_date)

  const apply = async () => {
    if (!result.ok) return
    setIsSaving(true)
    try {
      await updateCompany(company.id, { due_date: result.dueDate })

      // Audited like any other change to what the team will chase: in six
      // months the question is who moved this date, and from what.
      demoCompanyStore.addAuditEntry({
        id: `audit-${Date.now()}`,
        entity_type: 'company',
        entity_id: company.id,
        action: 'recalculate_due_date',
        actor_id: actorId ?? 'admin-1',
        before: { due_date: company.due_date ?? null },
        after: { due_date: result.dueDate, from: company.invoice_date, days: result.days },
        created_at: new Date().toISOString(),
      })

      toast.success(`Due date set to ${formatDate(result.dueDate)}.`, {
        description: `${formatDate(company.invoice_date!)} plus ${result.days} days, from ${company.payment_terms}.`,
      })
      onChanged?.()
    } catch {
      toast.error('That could not be saved. Try again in a moment.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="rounded-lg border border-border/50 bg-card/50 p-3"
      data-testid="recalculate-due-date"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Due date
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground" data-testid="due-date-basis">
            {company.due_date ? formatDate(company.due_date) : 'Not set'}
            {company.invoice_date && (
              <> · invoice {formatDate(company.invoice_date)}</>
            )}
            {company.payment_terms && <> · {company.payment_terms}</>}
          </p>
        </div>

        {result.ok ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving || !result.changed}
            onClick={apply}
            data-testid="recalculate-due-date-button"
          >
            <RefreshCcw className="mr-2 h-3.5 w-3.5" />
            {result.changed ? 'Recalculate from invoice date' : 'Already matches the terms'}
          </Button>
        ) : (
          <p className="max-w-xs text-xs text-muted-foreground" data-testid="recalculate-refused">
            {REFUSAL_MESSAGE[result.reason]}
          </p>
        )}
      </div>

      {/*
        Said before it is done, not after. The figure that moves is the one the
        chase list is ordered by, so the person pressing the button should know
        what they are about to change it to.
      */}
      {result.ok && result.changed && (
        <p className="mt-2 text-xs" data-testid="recalculate-preview">
          Would become <strong>{formatDate(result.dueDate)}</strong> — {formatDate(company.invoice_date!)}{' '}
          plus {result.days} days.
        </p>
      )}
    </div>
  )
}
