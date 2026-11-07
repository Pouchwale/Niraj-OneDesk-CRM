/**
 * The OTIF-SCORE file this page reads, as Active and Overdue Payments show
 * theirs (components/shared/ExcelSourceCard.tsx): which workbook and sheet,
 * when it was last saved, whether the figures on screen came from that save,
 * when the page last read it and what changed, "Auto-sync on save" and "Sync
 * now". Here a sync reads the file into the page; nothing is imported into
 * the CRM's records.
 */

import { AlertTriangle, CheckCircle2, FileSpreadsheet, History, Loader2, RefreshCcw } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useNow } from '@/hooks/useNow'
import type { ExcelBookStatus } from '@/lib/excel-source'
import { summariseRead } from '@/lib/otif-live'
import { cn, formatRelativeDate } from '@/lib/utils'
import type { OtifLiveData } from './useOtifLive'

const savedAt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

interface OtifSourceCardProps {
  status: ExcelBookStatus
  data: OtifLiveData | null
  reading: boolean
  error: string | null
  autoSync: boolean
  onAutoSync: (value: boolean) => void
  onSync: () => void
}

export function OtifSourceCard({ status, data, reading, error, autoSync, onAutoSync, onSync }: OtifSourceCardProps) {
  // Keeps "Last synced 3m ago" honest while the page sits open.
  useNow(60_000)
  const sheet = data?.sheetName ?? status.sheet
  const stale = status.exists && status.modifiedAt !== null && data !== null && status.modifiedAt !== data.modifiedAt

  return (
    <GlassCard className="p-4" data-testid="excel-source-otif">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FileSpreadsheet className={cn('mt-0.5 h-4 w-4 shrink-0', status.exists ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={status.name ?? undefined}>
              {status.name}
              {sheet && <span className="text-muted-foreground"> · sheet {sheet}</span>}
            </p>

            {!status.exists ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-rose-500">
                <AlertTriangle className="h-3 w-3" /> {status.error}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground" data-testid="excel-state-otif">
                {reading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Reading the file saved {formatRelativeDate(status.modifiedAt!)}…
                  </span>
                ) : !data ? (
                  <>Saved {formatRelativeDate(status.modifiedAt!)}. Not read yet.</>
                ) : stale ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    Changed {formatRelativeDate(status.modifiedAt!)}, after the last read. {autoSync ? 'Reading it…' : 'Sync to pick it up.'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Up to date with the file saved {formatRelativeDate(status.modifiedAt!)}
                  </span>
                )}
              </p>
            )}

            {data && (
              <p className="mt-0.5 text-xs text-muted-foreground" data-testid="excel-synced-otif">
                Last synced {formatRelativeDate(data.readAt)} · {summariseRead(data)}
              </p>
            )}
            {error && data && <p className="mt-0.5 text-xs text-rose-500">The last read failed: {error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" data-testid="otif-sync-summary-trigger">
                <History className="mr-2 h-3.5 w-3.5" />
                Last sync
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80" data-testid="otif-sync-summary">
              <p className="text-sm font-medium">Last sync</p>
              <p className="mt-0.5 text-xs text-muted-foreground">What the OTIF file gave this page, and when.</p>
              {data ? (
                <div className="mt-3 space-y-1 text-xs">
                  <p>
                    <span className="font-medium">Read</span> {formatRelativeDate(data.readAt)} · {summariseRead(data)}
                  </p>
                  <p className="text-muted-foreground">
                    {data.rows.length.toLocaleString('en-IN')} orders from sheet {data.sheetName}
                    {data.skipped > 0 ? `, ${data.skipped.toLocaleString('en-IN')} rows without a PO No. left out` : ''}
                  </p>
                  <p className="text-muted-foreground">File saved {savedAt(data.modifiedAt)}</p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Not read yet</p>
              )}
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2">
            <Switch id="excel-watch-otif" checked={autoSync} onCheckedChange={onAutoSync} disabled={!status.exists} />
            <Label htmlFor="excel-watch-otif" className="whitespace-nowrap text-xs text-muted-foreground">
              Auto-sync on save
            </Label>
          </div>
          <Button size="sm" onClick={onSync} disabled={reading || !status.exists} data-testid="otif-sync-now">
            <RefreshCcw className={cn('mr-2 h-4 w-4', reading && 'animate-spin')} />
            {reading ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
