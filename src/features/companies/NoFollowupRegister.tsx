import { useMemo, useState } from 'react'
import { BellOff, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { clearNoFollowup, deleteNoFollowup } from '@/lib/no-followup-api'
import { isNoFollowup } from '@/lib/no-followup'
import { normalizeBpCode } from '@/lib/bp-code'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Company, OverduePayment } from '@/lib/types'

interface Props {
  companies: Company[]
  overduePayments: OverduePayment[]
  /** Who is looking; recorded against a reinstatement or a deletion. */
  currentUserId?: string
  onChanged?: () => void
}

/** One customer set aside, and everything of theirs that went with it. */
interface SetAsideCustomer {
  key: string
  bpCode: string | null
  name: string
  /** Any one record, to address the action at. */
  entityId: string
  entityType: 'company' | 'overdue_payment'
  invoices: number
  ageingRows: number
  amount: number
  by: string | null
  at: string | null
  note: string | null
}

/**
 * Every customer the team has set aside, in one place.
 *
 * The same argument as the bankrupt register, with more force. Setting a
 * customer aside stops the chasing *and* takes their balance out of what is
 * owed, so an account left there by mistake does not merely go unworked — it
 * quietly makes the receivables look smaller than they are. That is not
 * something anybody should have to go looking for account by account.
 *
 * Grouped by customer rather than by row, because that is how the decision was
 * made: one customer usually has several invoices and an ageing row, and all of
 * them went aside together.
 */
export function NoFollowupRegister({ companies, overduePayments, currentUserId, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<SetAsideCustomer | null>(null)

  const setAside = useMemo<SetAsideCustomer[]>(() => {
    const byCustomer = new Map<string, SetAsideCustomer>()

    const seat = (
      key: string,
      seed: Omit<SetAsideCustomer, 'invoices' | 'ageingRows' | 'amount'>
    ): SetAsideCustomer => {
      const found = byCustomer.get(key)
      if (found) return found
      const made = { ...seed, invoices: 0, ageingRows: 0, amount: 0 }
      byCustomer.set(key, made)
      return made
    }

    for (const company of companies) {
      if (!isNoFollowup(company)) continue
      const code = normalizeBpCode(company.sap_bp_code)
      const key = code ? `bp:${code}` : `company:${company.id}`
      const entry = seat(key, {
        key,
        bpCode: code,
        name: company.name,
        entityId: company.id,
        entityType: 'company',
        by: company.no_followup_by ?? null,
        at: company.no_followup_at ?? null,
        note: company.no_followup_note ?? null,
      })
      entry.invoices++
      entry.amount += company.total_amount || 0
    }

    for (const row of overduePayments) {
      if (!isNoFollowup(row)) continue
      const code = normalizeBpCode(row.bp_code)
      const key = code ? `bp:${code}` : `ageing:${row.id}`
      const entry = seat(key, {
        key,
        bpCode: code,
        name: row.customer_name || row.bp_code,
        entityId: row.id,
        entityType: 'overdue_payment',
        by: row.no_followup_by ?? null,
        at: row.no_followup_at ?? null,
        note: row.no_followup_note ?? null,
      })
      entry.ageingRows++
      entry.amount += row.balance_due || 0
    }

    // Most recently set aside first: the ones still being talked about.
    return [...byCustomer.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  }, [companies, overduePayments])

  const total = setAside.reduce((sum, entry) => sum + entry.amount, 0)

  const resume = async (entry: SetAsideCustomer) => {
    if (!currentUserId) return
    setBusy(entry.key)
    try {
      await clearNoFollowup(
        { entityType: entry.entityType, entityId: entry.entityId, bpCode: entry.bpCode },
        currentUserId
      )
      toast.success(`${entry.name} is back in the follow-up lists.`, {
        description: `${formatCurrency(entry.amount)} counts towards what is owed again.`,
      })
      onChanged?.()
    } catch {
      toast.error('That could not be undone. Try again in a moment.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!currentUserId || !deleting) return
    setBusy(deleting.key)
    try {
      const removed = await deleteNoFollowup(
        { entityType: deleting.entityType, entityId: deleting.entityId, bpCode: deleting.bpCode },
        currentUserId
      )
      toast.success(`${deleting.name} removed.`, {
        description: `${removed} record${removed === 1 ? '' : 's'} deleted. A later sync of the workbook will bring them back.`,
      })
      setDeleting(null)
      onChanged?.()
    } catch {
      toast.error('That could not be deleted. Try again in a moment.')
    } finally {
      setBusy(null)
    }
  }

  if (setAside.length === 0) {
    return (
      <GlassCard className="p-8 text-center" data-testid="no-followup-register">
        <BellOff className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">Nobody has been set aside</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Accounts marked "No follow-up" leave the working lists and their balance leaves the
          outstanding total. They would all be listed here.
        </p>
      </GlassCard>
    )
  }

  return (
    <>
      <GlassCard className="overflow-hidden" data-testid="no-followup-register">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BellOff className="h-4 w-4 text-amber-500" />
              Set aside — no follow-up
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Not chased, and not counted in what is owed. Who decided each, and why.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold" data-testid="no-followup-total">
              {formatCurrency(total)}
            </p>
            <p className="text-xs text-muted-foreground">
              held out · {setAside.length} customer{setAside.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Records</TableHead>
                <TableHead className="text-right">Held out</TableHead>
                <TableHead>Set aside by</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {setAside.map((entry) => (
                <TableRow key={entry.key} data-testid={`no-followup-row-${entry.bpCode ?? entry.entityId}`}>
                  <TableCell>
                    <div className="font-medium">{entry.name}</div>
                    {entry.bpCode && (
                      <div className="font-mono text-xs text-muted-foreground">{entry.bpCode}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.invoices > 0 && (
                      <div>
                        {entry.invoices} invoice{entry.invoices === 1 ? '' : 's'}
                      </div>
                    )}
                    {entry.ageingRows > 0 && <div>{entry.ageingRows} ageing row</div>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(entry.amount)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{entry.by ? getCoordinatorDisplayName(entry.by) : 'Unknown'}</div>
                    {entry.at && (
                      <div className="text-muted-foreground">{formatDate(entry.at.slice(0, 10))}</div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[16rem] text-xs text-muted-foreground">
                    {entry.note || <span className="italic">No reason given</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === entry.key || !currentUserId}
                        onClick={() => resume(entry)}
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Resume
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                        disabled={busy === entry.key || !currentUserId}
                        onClick={() => setDeleting(entry)}
                        data-testid={`no-followup-delete-${entry.bpCode ?? entry.entityId}`}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="no-followup-delete-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-500" />
              Delete {deleting?.name}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm">
                <p>
                  This removes {deleting?.invoices ? `${deleting.invoices} invoice` : ''}
                  {deleting?.invoices && deleting?.ageingRows ? ' and ' : ''}
                  {deleting?.ageingRows ? `${deleting.ageingRows} ageing row` : ''} from the CRM.
                </p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    {/*
                      Said first and plainly. The invoices are still in the
                      workbook, so this is a delete that does not stay deleted,
                      and finding that out by surprise is what would cost
                      somebody their trust in the button.
                    */}
                    <strong>A later sync will bring them back</strong> — the invoices are still in
                    the Excel file, and they will return without the no-follow-up mark.
                  </li>
                  <li>
                    The follow-ups logged against them go too. Nothing else is affected.
                  </li>
                  <li>
                    To stop chasing them without losing them, use <strong>Resume</strong> and set
                    them aside again, or take them out of the workbook.
                  </li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={remove}
              disabled={busy !== null}
              data-testid="no-followup-delete-confirm"
            >
              {busy ? 'Deleting…' : 'Delete from the CRM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
