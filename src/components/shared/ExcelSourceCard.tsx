import { useCallback, useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, RefreshCcw, AlertTriangle, CheckCircle2, History } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn, formatRelativeDate } from '@/lib/utils'
import { useNow } from '@/hooks/useNow'
import { ImportWindowFilter } from '@/components/shared/ImportWindowFilter'
import {
  affectsBook,
  describeImportFilter,
  loadImportFilter,
  saveImportFilter,
  NO_FILTER,
  type ImportFilter,
} from '@/lib/excel-filter'
import {
  BOOK_LABEL,
  BOOK_PATH_ENV,
  describeSync,
  getExcelStatus,
  syncBookFromExcel,
  type ExcelBook,
  type ExcelBookStatus,
} from '@/lib/excel-source'
import { EXCEL_BOOKS } from '@shared/api'
import {
  readSyncEntry,
  readSyncLog,
  summariseSync,
  writeSyncEntry,
  type SyncLog,
  type SyncLogEntry,
} from '@/lib/sync-log'

interface ExcelSourceCardProps {
  book: ExcelBook
  /** Recorded against the upload, and used for the audit entry. */
  adminId?: string
  /** Called after rows change, so the page reloads its data. */
  onImported: () => void
  className?: string
}

/** How often the file's timestamp is checked while watching. */
const POLL_MS = 10_000
const WATCH_KEY = 'crm.excel.watch'

function readWatch(book: ExcelBook): boolean {
  try {
    return localStorage.getItem(`${WATCH_KEY}.${book}`) === 'true'
  } catch {
    return false
  }
}

function writeWatch(book: ExcelBook, value: boolean): void {
  try {
    localStorage.setItem(`${WATCH_KEY}.${book}`, String(value))
  } catch {
    // A preference, not data; carry on without remembering it.
  }
}

/**
 * The Excel file this book is connected to.
 *
 * Shows which workbook the server is reading, when it last changed, and
 * whether what is on screen came from that version. With watching on, a save
 * in Excel is imported on its own within a few seconds; the same import runs
 * either way, so the button and the watcher can never disagree.
 */
export function ExcelSourceCard({ book, adminId, onImported, className }: ExcelSourceCardProps) {
  const [status, setStatus] = useState<ExcelBookStatus | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [watching, setWatching] = useState(() => readWatch(book))
  /*
   * Both read from the stored log rather than starting empty. Held only in
   * component state, they were forgotten on every navigation, so a book synced
   * two minutes ago came back reading "Not imported yet".
   */
  const [importedAt, setImportedAt] = useState<string | null>(() => readSyncEntry(book)?.modifiedAt ?? null)
  /** The last sync of every book, so this card can speak for both. */
  const [log, setLog] = useState<SyncLog>(() => readSyncLog())
  /**
   * Only Active Payments is filtered.
   *
   * The ageing sheet carries no dates to slice by — only buckets — and the
   * control was removed from it. A filter saved for that book before then is
   * deliberately not read back: a hidden setting still narrowing an import is
   * worse than no filter and worse than a visible one.
   */
  const filterable = book === 'companies'

  /** Which slice of the workbook's timeline to bring in. */
  const [filter, setFilter] = useState<ImportFilter>(() =>
    filterable ? loadImportFilter(book) : NO_FILTER
  )
  const busy = useRef(false)

  // Keeps "Last synced 3m ago" honest while the page sits open, rather than
  // freezing at whatever it said when the card first rendered.
  useNow(60_000)

  const refreshStatus = useCallback(async () => {
    const all = await getExcelStatus()
    setStatus(all[book])
    return all[book]
  }, [book])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const runSync = useCallback(
    async (silent: boolean) => {
      // One import at a time: a poll must never overlap a button press.
      if (busy.current) return
      busy.current = true
      setIsSyncing(true)
      try {
        const result = await syncBookFromExcel(book, { adminId, filter })

        // Recorded either way. A sync that failed still happened, and "we
        // tried at 4pm and could not read the file" is worth more than
        // silence.
        const entry: SyncLogEntry = {
          syncedAt: new Date().toISOString(),
          modifiedAt: result.modifiedAt,
          created: result.created,
          updated: result.updated,
          added: result.changes?.added ?? 0,
          addedValue: result.changes?.addedValue ?? 0,
          changed: result.changes?.changed ?? 0,
          delta: result.changes?.delta ?? 0,
          settled: (result.settled?.paid ?? 0) + (result.settled?.gone ?? 0),
          upgraded: result.upgraded ?? 0,
          skipped: result.skipped,
          needsCoordinator: result.skippedBecause?.needsCoordinator ?? 0,
          filteredOut: result.filteredOut ?? 0,
          success: result.success,
        }
        writeSyncEntry(book, entry)
        setLog((current) => ({ ...current, [book]: entry }))

        if (result.success) {
          setImportedAt(result.modifiedAt)
          onImported()
          if (!silent || result.created + result.updated > 0) {
            toast.success(describeSync(result, book))
          }
        } else {
          toast.error(result.error ?? 'The sync failed.')
          // A failed read leaves the mark alone, so the next poll tries again.
        }
        await refreshStatus()
      } finally {
        busy.current = false
        setIsSyncing(false)
      }
    },
    [book, adminId, onImported, refreshStatus, filter]
  )

  // Watch the file's timestamp and import a fresh save on its own.
  useEffect(() => {
    if (!watching || !status?.configured) return
    const tick = async () => {
      const next = await refreshStatus()
      if (!next?.exists || !next.modifiedAt) return
      if (next.modifiedAt !== importedAt) await runSync(true)
    }
    const id = window.setInterval(tick, POLL_MS)
    tick()
    return () => window.clearInterval(id)
  }, [watching, status?.configured, importedAt, refreshStatus, runSync])

  if (!status) return null

  if (!status.configured) {
    return (
      <GlassCard className={cn('p-4', className)}>
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">No Excel file connected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add <code className="font-mono">{BOOK_PATH_ENV[book]}</code> to{' '}
              <code className="font-mono">.env.local</code> with the full path to the {BOOK_LABEL[book]}{' '}
              workbook, then restart the dev server.
            </p>
          </div>
        </div>
      </GlassCard>
    )
  }

  const stale = status.exists && status.modifiedAt !== null && status.modifiedAt !== importedAt
  const filterApplies = filterable && affectsBook(filter, book)
  const everImported = importedAt !== null
  const mine = log[book] ?? null

  return (
    <GlassCard className={cn('p-4', className)} data-testid={`excel-source-${book}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FileSpreadsheet
            className={cn('mt-0.5 h-4 w-4 shrink-0', status.exists ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={status.name ?? undefined}>
              {status.name}
              {status.sheet && <span className="text-muted-foreground"> · sheet {status.sheet}</span>}
            </p>

            {!status.exists ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-rose-500">
                <AlertTriangle className="h-3 w-3" /> {status.error}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`excel-state-${book}`}>
                {!everImported ? (
                  <>Saved {formatRelativeDate(status.modifiedAt!)}. Not imported yet.</>
                ) : stale ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    Changed {formatRelativeDate(status.modifiedAt!)}, after the last import. Sync to pick it up.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Up to date with the file saved{' '}
                    {formatRelativeDate(status.modifiedAt!)}
                  </span>
                )}
              </p>
            )}

            {/*
              When this app last read the file, which is not the same question
              as when the file was last saved. A book nobody has synced since
              Tuesday looks perfectly current if you only show the file's own
              timestamp.
            */}
            {mine && (
              <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`excel-synced-${book}`}>
                Last synced {formatRelativeDate(mine.syncedAt)} · {summariseSync(mine)}
              </p>
            )}

            {/*
              Stated on the card, not only inside the popover: a figure that
              looks low because of a window somebody set last week should say so
              where the figure is, rather than waiting to be discovered.
            */}
            {filterApplies && (
              <p
                className="mt-0.5 text-xs font-medium text-primary"
                data-testid={`excel-filter-${book}`}
              >
                {describeImportFilter(filter, book)}
              </p>
            )}
          </div>
        </div>

        {/*
          Wraps as whole controls rather than squeezing: on a narrow screen the
          switch's label was breaking across three lines beside it.
        */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
          {/*
            Both books, from either screen. Somebody standing on Overdue asking
            "is this current?" is usually also asking it about Active Payments,
            and making them go and look is how one of the two quietly goes a
            week without a sync.
          */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" data-testid="sync-summary-trigger">
                <History className="mr-2 h-3.5 w-3.5" />
                Last sync
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80" data-testid="sync-summary">
              <p className="text-sm font-medium">Last sync</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                What each book picked up, and when.
              </p>
              <div className="mt-3 space-y-3">
                {EXCEL_BOOKS.map((each) => {
                  const entry = log[each] ?? null
                  return (
                    <div key={each} data-testid={`sync-summary-${each}`}>
                      <p className="text-xs font-medium">{BOOK_LABEL[each]}</p>
                      {entry ? (
                        <>
                          <p
                            className={cn(
                              'text-xs',
                              entry.success ? 'text-muted-foreground' : 'text-rose-500'
                            )}
                          >
                            {formatRelativeDate(entry.syncedAt)} · {summariseSync(entry)}
                          </p>
                          {entry.filteredOut > 0 && (
                            <p className="text-xs text-primary">
                              {entry.filteredOut.toLocaleString('en-IN')} outside the date filter
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not synced yet</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2">
            <Switch
              id={`excel-watch-${book}`}
              checked={watching}
              onCheckedChange={(value) => {
                setWatching(value)
                writeWatch(book, value)
              }}
              disabled={!status.exists}
            />
            <Label
              htmlFor={`excel-watch-${book}`}
              className="whitespace-nowrap text-xs text-muted-foreground"
            >
              Auto-sync on save
            </Label>
          </div>
          {filterable && (
            <ImportWindowFilter
              book={book}
              value={filter}
              onChange={(next) => {
                setFilter(next)
                saveImportFilter(book, next)
              }}
            />
          )}
          <Button size="sm" onClick={() => runSync(false)} disabled={isSyncing || !status.exists}>
            <RefreshCcw className={cn('mr-2 h-4 w-4', isSyncing && 'animate-spin')} />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
