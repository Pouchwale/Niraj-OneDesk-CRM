import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CalendarRange, Download, Loader2, Percent, Table2, Trash2, Trophy } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { formatCurrency } from '@/lib/utils'
import {
  deleteSavedDay,
  getSavedDay,
  getScoreResult,
  listSavedDays,
  listScoreResults,
  saveScoreResult,
  saveTargetPercentage,
} from '@/lib/snapshots-api'
import {
  SNAPSHOT_RETENTION_DAYS,
  type OverdueSnapshot,
  type OverdueSnapshotMeta,
  type ScoreResult,
  type ScoreResultMeta,
  type SnapshotSettings,
  type SnapshotTableRow,
} from '@shared/snapshots'
import {
  DAY_COLUMNS,
  DAY_COLUMNS_WITHOUT_TARGETS,
  RESULT_COLUMNS,
  daySheet,
  rawDaySheet,
  resultSheet,
  scoreTwoDays,
  totalOfDay,
} from './transform'
import { downloadWorkbook, fileStamp } from './download'
import { SaveTodayButton } from './SaveTodayButton'

/** "11 Sep 2026, 09:40" */
function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const rupees = (n: number) => formatCurrency(Math.round(n))

/** A transformed day, as a table. The newer day of a comparison is shown without its targets. */
function DayTable({ table, withTargets = true }: { table: SnapshotTableRow[]; withTargets?: boolean }) {
  const total = totalOfDay(table)
  const columns = withTargets ? DAY_COLUMNS : DAY_COLUMNS_WITHOUT_TARGETS
  const cells = (r: Omit<SnapshotTableRow, 'coordinatorId' | 'coordinatorName'>) => {
    const base = [r.balanceDue, r.due0to30, r.due31to60, r.due61to90, r.due91to120, r.due121Plus]
    return withTargets ? [...base, r.target0to120, r.target121Plus] : base
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {table.map((row) => (
            <tr key={row.coordinatorId}>
              <td className="px-3 py-2 font-medium">{row.coordinatorName}</td>
              {cells(row).map((v, i) => (
                <td key={i} className="px-3 py-2 text-right tabular-nums">{rupees(v)}</td>
              ))}
            </tr>
          ))}
          <tr className="bg-muted/30 font-semibold">
            <td className="px-3 py-2">Total</td>
            {cells(total).map((v, i) => (
              <td key={i} className="px-3 py-2 text-right tabular-nums">{rupees(v)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ResultTable({ result }: { result: ScoreResult }) {
  const sum = (pick: (r: ScoreResult['rows'][number]) => number) => result.rows.reduce((t, r) => t + pick(r), 0)
  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full text-sm" data-testid="score-result">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {RESULT_COLUMNS.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {result.rows.map((r) => (
            <tr key={r.coordinatorName}>
              <td className="px-3 py-2 font-medium">{r.coordinatorName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{rupees(r.target30to120)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{rupees(r.achieve30to120)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{rupees(r.target120Plus)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{rupees(r.achieve120Plus)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.kpiScore.toFixed(2)}</td>
            </tr>
          ))}
          <tr className="bg-muted/30 font-semibold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{rupees(sum((r) => r.target30to120))}</td>
            <td className="px-3 py-2 text-right tabular-nums">{rupees(sum((r) => r.achieve30to120))}</td>
            <td className="px-3 py-2 text-right tabular-nums">{rupees(sum((r) => r.target120Plus))}</td>
            <td className="px-3 py-2 text-right tabular-nums">{rupees(sum((r) => r.achieve120Plus))}</td>
            <td className="px-3 py-2" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/**
 * Weekly KPI: the team leader's weekly coordinator score, kept in the system.
 *
 * She used to download the Overdue module every week and compare the old file
 * with the new one. Here a day is saved instead, turned into her sheet with
 * Transform, and any two saved days are compared to give each coordinator's
 * score by the existing Collection KPI calculation.
 */
export function WeeklyKpiPage() {
  const { user } = useAuth()
  const [days, setDays] = useState<OverdueSnapshotMeta[]>([])
  const [settings, setSettings] = useState<SnapshotSettings | null>(null)
  const [results, setResults] = useState<ScoreResultMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState<string | null>(null)

  const [percentInput, setPercentInput] = useState('')
  const [savingPercent, setSavingPercent] = useState(false)

  const [transformed, setTransformed] = useState<OverdueSnapshot | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<OverdueSnapshotMeta | null>(null)

  const [oldId, setOldId] = useState('')
  const [newId, setNewId] = useState('')
  const [scoring, setScoring] = useState(false)
  const [score, setScore] = useState<ScoreResult | null>(null)

  const load = useCallback(async () => {
    try {
      const [list, kept] = await Promise.all([listSavedDays(), listScoreResults()])
      setDays(list.days)
      setSettings(list.settings)
      setResults(kept.results)
      setPercentInput(list.settings.percentage === null ? '' : String(list.settings.percentage))
      setUnreachable(null)
    } catch (err) {
      setUnreachable(err instanceof Error ? err.message : 'The server is not answering.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const byId = useMemo(() => new Map(days.map((d) => [d.id, d])), [days])
  // The newer day must be later than the older one.
  const laterDays = useMemo(() => {
    const old = byId.get(oldId)
    return old ? days.filter((d) => d.savedAt > old.savedAt) : []
  }, [days, byId, oldId])

  const savePercent = async () => {
    const value = Number(percentInput)
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      toast.error('Enter a percentage above 0 and no more than 100.')
      return
    }
    if (!user) return
    setSavingPercent(true)
    try {
      setSettings(await saveTargetPercentage(value, user.id))
      toast.success(`Target percentage set to ${value}%`, {
        description: 'It applies to days saved from now on. Days already saved keep their own percentage.',
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the percentage.')
    } finally {
      setSavingPercent(false)
    }
  }

  const openTransform = async (id: string) => {
    setOpening(id)
    try {
      setTransformed(await getSavedDay(id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open that day.')
    } finally {
      setOpening(null)
    }
  }

  const downloadDay = async (meta: OverdueSnapshotMeta) => {
    try {
      const saved = await getSavedDay(meta.id)
      downloadWorkbook(`Overdue saved ${fileStamp(saved.savedAt)}.xlsx`, [
        { name: 'Transformed', rows: daySheet(saved.table) },
        { name: 'All data', rows: rawDaySheet(saved.rows) },
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download that day.')
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteSavedDay(deleting.id)
      toast.success(`The day saved ${when(deleting.savedAt)} is deleted.`)
      if (oldId === deleting.id) setOldId('')
      if (newId === deleting.id) setNewId('')
      setDeleting(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete that day.')
    }
  }

  const generate = async () => {
    if (!user || !oldId || !newId) return
    setScoring(true)
    try {
      const [older, newer] = await Promise.all([getSavedDay(oldId), getSavedDay(newId)])
      if (older.savedAt >= newer.savedAt) {
        toast.error('The old day must be earlier than the new day.')
        return
      }
      const outcome = scoreTwoDays(older.table, newer.table)
      const input = {
        generatedBy: user.id,
        generatedByName: getCoordinatorDisplayName(user.id),
        oldId,
        newId,
        oldSavedAt: older.savedAt,
        newSavedAt: newer.savedAt,
        rows: outcome.rows,
        flags: outcome.flags,
        oldTable: older.table,
        newTable: newer.table,
      }
      const { result } = await saveScoreResult(input)
      setScore({ ...input, id: result.id, generatedAt: result.generatedAt })
      setResults((await listScoreResults()).results)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the score.')
    } finally {
      setScoring(false)
    }
  }

  const viewResult = async (id: string) => {
    try {
      setScore(await getScoreResult(id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open that result.')
    }
  }

  const downloadResult = (result: ScoreResult) => {
    downloadWorkbook(`KPI score ${fileStamp(result.oldSavedAt)} to ${fileStamp(result.newSavedAt)}.xlsx`, [
      { name: 'KPI score', rows: resultSheet(result.rows) },
      { name: 'Old day', rows: daySheet(result.oldTable) },
      { name: 'New day', rows: daySheet(result.newTable, false) },
    ])
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading saved days…
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Weekly KPI"
        subtitle="Save the Overdue data on a day, then compare two saved days to score each coordinator"
        icon={<CalendarRange className="h-6 w-6" />}
      >
        <SaveTodayButton variant="default" onSaved={load} />
      </PageHeader>

      {unreachable && (
        <GlassCard className="flex items-start gap-2 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{unreachable}</span>
        </GlassCard>
      )}

      {/* The one percentage for both targets. */}
      <GlassCard className="space-y-3 p-5" data-testid="target-percentage">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Percent className="h-5 w-5 text-primary" /> Target percentage
        </h3>
        <p className="max-w-3xl text-sm text-muted-foreground">
          0 to 120 Days Collection target = this % of (0-30 + 31-60 + 61-90 + 91-120). 121+ Days Target =
          this % of 121+. It applies to days saved from now on; days already saved keep the percentage
          they were saved with.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="target-percent">Percentage</Label>
            <div className="flex items-center gap-2">
              <Input
                id="target-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={percentInput}
                onChange={(e) => setPercentInput(e.target.value)}
                className="w-32"
                placeholder="e.g. 20"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <Button onClick={savePercent} disabled={savingPercent}>
            {savingPercent ? 'Saving…' : 'Save percentage'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {settings?.percentage === null || !settings
              ? 'Not set yet — a day cannot be saved until it is.'
              : `Now ${settings.percentage}%${settings.updatedAt ? `, set ${when(settings.updatedAt)}` : ''}`}
          </span>
        </div>
      </GlassCard>

      {/* Every saved day. */}
      <GlassCard className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarRange className="h-5 w-5 text-primary" /> Saved days
        </h3>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No day has been saved yet. Use “Save today’s data” here or on the Overdue Payments screen.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="saved-days">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Saved</th>
                  <th className="px-3 py-2 text-left font-medium">Saved by</th>
                  <th className="px-3 py-2 text-left font-medium">Excel file saved</th>
                  <th className="px-3 py-2 text-right font-medium">Coordinators</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 text-right font-medium">Target %</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {days.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 font-medium">{when(d.savedAt)}</td>
                    <td className="px-3 py-2">{d.savedByName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{when(d.fileModifiedAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.coordinatorCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupees(d.totalBalance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.percentage}%</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openTransform(d.id)} disabled={opening === d.id}>
                          <Table2 className="mr-1.5 h-3.5 w-3.5" />
                          {opening === d.id ? 'Opening…' : 'Transform'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadDay(d)} aria-label="Download this day">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleting(d)} aria-label="Delete this day">
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
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

      {/* Two days in, one score out. */}
      <GlassCard className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Trophy className="h-5 w-5 text-primary" /> Generate score
        </h3>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Old day (its targets are used)</Label>
            <Select
              value={oldId}
              onValueChange={(v) => {
                setOldId(v)
                setNewId('')
              }}
            >
              <SelectTrigger data-testid="old-day">
                <SelectValue placeholder="Choose the older day" />
              </SelectTrigger>
              <SelectContent>
                {days.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {when(d.savedAt)} · {d.percentage}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>New day</Label>
            <Select value={newId} onValueChange={setNewId} disabled={!oldId}>
              <SelectTrigger data-testid="new-day">
                <SelectValue placeholder={oldId ? 'Choose a later day' : 'Choose the old day first'} />
              </SelectTrigger>
              <SelectContent>
                {laterDays.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {when(d.savedAt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={!oldId || !newId || scoring}>
            {scoring ? 'Working…' : 'Generate score'}
          </Button>
        </div>

        {score && (
          <div className="space-y-5 border-t border-border/50 pt-4">
            {score.flags.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                {score.flags.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {f}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">
                KPI score · {when(score.oldSavedAt)} → {when(score.newSavedAt)}
              </h4>
              <Button size="sm" variant="outline" onClick={() => downloadResult(score)}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
            </div>
            <ResultTable result={score} />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">Old day · {when(score.oldSavedAt)}</h4>
              <DayTable table={score.oldTable} />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">New day · {when(score.newSavedAt)}</h4>
              <DayTable table={score.newTable} withTargets={false} />
            </div>
          </div>
        )}
      </GlassCard>

      {/* Results generated before, kept three months. */}
      <GlassCard className="space-y-3 p-5">
        <h3 className="text-lg font-semibold">Past results</h3>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No score has been generated yet.</p>
        ) : (
          <ul className="divide-y divide-border/50 text-sm">
            {results.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{when(r.oldSavedAt)}</span> →{' '}
                  <span className="font-medium">{when(r.newSavedAt)}</span>
                  <span className="text-muted-foreground"> · by {r.generatedByName}, {when(r.generatedAt)}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => viewResult(r.id)}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Saved days and results are kept for {SNAPSHOT_RETENTION_DAYS / 30} months, then removed automatically.
        </p>
      </GlassCard>

      {/* Transform: the saved day as Niki's sheet. */}
      <Dialog open={Boolean(transformed)} onOpenChange={(open) => !open && setTransformed(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Saved {transformed ? when(transformed.savedAt) : ''}</DialogTitle>
            <DialogDescription>
              {transformed
                ? `${transformed.coordinatorCount} coordinators · targets at ${transformed.percentage}% · bankrupt, no follow-up, settled and unassigned rows left out`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {transformed && <DayTable table={transformed.table} />}
          <DialogFooter>
            {transformed && (
              <Button
                variant="outline"
                onClick={() =>
                  downloadWorkbook(`Overdue saved ${fileStamp(transformed.savedAt)}.xlsx`, [
                    { name: 'Transformed', rows: daySheet(transformed.table) },
                    { name: 'All data', rows: rawDaySheet(transformed.rows) },
                  ])
                }
              >
                <Download className="mr-1.5 h-4 w-4" /> Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deleting a saved day. */}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete the day saved {deleting ? when(deleting.savedAt) : ''}?</DialogTitle>
            <DialogDescription>
              It cannot be brought back. Results already generated from it stay in Past results.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
