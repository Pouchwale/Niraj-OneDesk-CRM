/**
 * Overview → "Download report (PDF)": pick a period, get every part of the
 * Overview for it as one printable report.
 */

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { weekStart } from '@/features/assistant/scores'
import { demoCompanyStore } from '@/lib/demo-companies'
import { addDaysISO, cn, todayISO } from '@/lib/utils'
import { buildOverviewReport } from './overview-report'

const monthStart = (date: string) => `${date.slice(0, 7)}-01`

function presets(today: string) {
  const thisMonth = monthStart(today)
  const lastMonthEnd = addDaysISO(thisMonth, -1)
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: addDaysISO(today, -1), to: addDaysISO(today, -1) },
    { label: 'This week', from: weekStart(today), to: today },
    { label: 'Last 7 days', from: addDaysISO(today, -6), to: today },
    { label: 'This month', from: thisMonth, to: today },
    { label: 'Last month', from: monthStart(lastMonthEnd), to: lastMonthEnd },
  ]
}

export function OverviewReportButton({ coordinators }: { coordinators: { id: string; full_name: string }[] }) {
  const { user } = useAuth()
  const today = todayISO()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(weekStart(today))
  const [to, setTo] = useState(today)
  const [busy, setBusy] = useState(false)
  const valid = Boolean(from && to && from <= to)

  const download = async () => {
    if (!valid) return
    setBusy(true)
    try {
      const report = buildOverviewReport({
        from,
        to,
        today,
        coordinators,
        companies: demoCompanyStore.getAllCompanies(),
        overduePayments: demoCompanyStore.getAllOverduePayments(),
        followups: demoCompanyStore.getAllFollowups(),
        plans: demoCompanyStore.getDailyPlans(),
        proofRequests: demoCompanyStore.getProofRequests(),
        decisionRequests: demoCompanyStore.getDecisionRequests(),
        attendance: demoCompanyStore.getAttendanceEntries(),
        nameOf: (id) => (id ? getCoordinatorDisplayName(id) : ''),
      })
      const { downloadOverviewPdf } = await import('./overview-report-pdf')
      await downloadOverviewPdf(report, user?.full_name ?? 'OneDesk CRM')
      toast.success('Report downloaded.')
      setOpen(false)
    } catch (err) {
      toast.error('The report could not be made.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="overview-report">
        <FileDown className="mr-2 h-4 w-4" /> Download report (PDF)
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Overview report</DialogTitle>
            <DialogDescription>
              One PDF for the period: summary figures, coordinator summary, daily scores, every follow-up, Robi's tasks,
              proof checks, approvals, customers set aside and attendance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {presets(today).map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('h-7 px-2.5 text-xs', from === p.from && to === p.to && 'border-primary text-primary')}
                  onClick={() => {
                    setFrom(p.from)
                    setTo(p.to)
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">From</span>
                <input
                  id="report-from"
                  type="date"
                  value={from}
                  max={today}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">To</span>
                <input
                  id="report-to"
                  type="date"
                  value={to}
                  max={today}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                />
              </label>
            </div>
            {!valid && <p className="text-xs text-rose-600">The start date must be on or before the end date.</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={download} disabled={!valid || busy} data-testid="overview-report-download">
              <FileDown className="mr-2 h-4 w-4" /> {busy ? 'Making the report…' : 'Download PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
