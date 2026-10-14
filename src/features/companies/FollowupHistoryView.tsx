import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, MessageCircle, Mail, Phone, Users, FileText, Search, History } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { StickyScrollbar } from '@/components/shared/StickyScrollbar'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency, formatDate, todayISO, addDaysISO } from '@/lib/utils'
import { getAllCoordinators } from '@/features/auth/AuthContext'
import {
  collapseToLatestPerAccount,
  filterHistoryRows,
  getFollowupHistory,
  summariseHistory,
  type FollowupHistoryEntry,
} from '@/lib/followups-api'
import type { FollowupMode, FollowupStatus } from '@/lib/types'
import { FOLLOWUP_STATUS_LABEL, FOLLOWUP_STATUS_STYLE } from '@/lib/followup-status'

interface FollowupHistoryViewProps {
  /**
   * Pins the history to one person. Given for a coordinator looking at their
   * own trail; omitted for the leader, who gets a coordinator filter instead.
   */
  coordinatorId?: string
  /** Re-reads when the parent saves a follow-up. */
  refreshKey?: number
  /** Leave out accounts set aside (no follow-up or bankrupt): the tab inside Active Payments. */
  hideSetAside?: boolean
}

const MODE_ICON: Record<FollowupMode, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  in_person: Users,
  other: FileText,
}

const MODE_LABEL: Record<FollowupMode, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  in_person: 'In person',
  other: 'Other',
}

/** Windows offered on the date filter, newest work first. */
const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
] as const

/**
 * The follow-up trail, read by coordinator rather than by account.
 *
 * The same records the company timeline shows, sliced the other way: what did
 * this person do, across every account they touched. Attribution is by who
 * logged the follow-up, so a trail stays with the person who made the calls.
 */
export function FollowupHistoryView({ coordinatorId, refreshKey = 0, hideSetAside = false }: FollowupHistoryViewProps) {
  const tableScroller = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<FollowupHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [who, setWho] = useState<string>(coordinatorId ?? 'all')
  const [range, setRange] = useState<string>('30')
  const [status, setStatus] = useState<string>('all')
  const [search, setSearch] = useState('')
  /**
   * Every follow-up as its own row - the full log - or one row per account
   * with only its latest. The log is the default: filtering to Pragati should
   * list all 25 of her follow-ups, not the 12 accounts behind them.
   */
  const [show, setShow] = useState<'every' | 'latest'>('every')

  const coordinators = useMemo(() => getAllCoordinators(), [])
  const showWhoFilter = !coordinatorId

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    getFollowupHistory({
      excludeSetAside: hideSetAside,
      coordinatorId: coordinatorId ?? (who === 'all' ? undefined : who),
      from: range === 'all' ? undefined : addDaysISO(todayISO(), -Number(range)),
    })
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch(() => {
        // Say so rather than showing an empty list that reads as "no activity".
        if (!cancelled) {
          setEntries([])
          setError('Could not load the follow-up history.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [coordinatorId, who, range, refreshKey, hideSetAside])

  // Roll up to one row per coordinator per account first, then narrow. Doing it
  // the other way round let "no response" surface a call the customer has since
  // answered, which is the past record this view is meant to hide.
  const rows = useMemo(() => {
    const base =
      show === 'latest'
        ? collapseToLatestPerAccount(entries)
        : entries
            .map((entry) => ({ ...entry, touches: 1 }))
            // Newest first; the same day falls back to when it was recorded.
            .sort(
              (a, b) =>
                b.followup_date.localeCompare(a.followup_date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')
            )
    return filterHistoryRows(base, {
      status: status === 'all' ? undefined : (status as FollowupStatus),
      search: search.trim() || undefined,
    })
  }, [entries, status, search, show])
  // The tiles describe the rows on screen, counting the calls behind them.
  const summary = useMemo(() => summariseHistory(rows), [rows])

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account, BP code or note"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {showWhoFilter && (
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coordinators</SelectItem>
                  {coordinators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={show} onValueChange={(v) => setShow(v as 'every' | 'latest')}>
              <SelectTrigger className="w-[190px]" data-testid="history-show">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="every">Every follow-up</SelectItem>
                <SelectItem value="latest">Latest per account</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any outcome</SelectItem>
                {(Object.keys(FOLLOWUP_STATUS_LABEL) as FollowupStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {/* Every promise, however the outcome was recorded. */}
                    {s === 'committed' ? 'Committed (any promise)' : FOLLOWUP_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* The roll-up answers "was this a productive fortnight" before the table
          is read at all. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Follow-ups logged', value: String(summary.total) },
          { label: 'Accounts touched', value: String(summary.accountsTouched) },
          {
            label: 'Commitments secured',
            value: summary.commitmentsMade === 0
              ? '0'
              : `${summary.commitmentsKept}/${summary.commitmentsMade} kept`,
          },
          { label: 'Amount committed', value: formatCurrency(summary.amountCommitted) },
        ].map((tile) => (
          <GlassCard key={tile.label} className="p-4 sm:p-5">
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">{tile.label}</p>
            <p className="mt-2 text-lg font-bold tabular-nums sm:text-xl lg:text-2xl">{tile.value}</p>
          </GlassCard>
        ))}
      </div>

      {/* overflow-visible: a clipping card would stop the table's scrollbar from pinning to the screen. */}
      <GlassCard className="overflow-visible p-4 sm:p-6">
        {error ? (
          <p className="py-10 text-center text-sm text-rose-500">{error}</p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading history…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="No follow-ups in this window"
            description="Widen the date range, or clear the filters, to see earlier activity."
          />
        ) : (
          <div className="rounded-lg border border-border">
            {/*
              Fixed layout: the columns share the width there is, so the table
              always fits and nothing scrolls sideways. Related details sit
              together in one cell (who under when, mode under outcome, amount
              under the promise date) instead of a column each.
            */}
            <Table
              containerRef={tableScroller}
              containerClassName="scrollbar-none"
              className="table-fixed [&_td]:px-3 [&_td]:py-3 [&_td]:align-top [&_th]:h-10 [&_th]:px-3"
            >
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[26%]" />
                <col className="w-[15%]" />
                <col className="w-[14%]" />
                <col className="w-[30%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>{show === 'latest' ? 'Last contact' : 'Date'}{showWhoFilter ? ' · by' : ''}</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Commitment</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => {
                  const Icon = MODE_ICON[entry.mode]
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="tabular-nums">
                        <span className="block text-sm text-foreground">
                          {formatDate(entry.followup_date)}
                          {entry.edited_at && (
                            <span className="ml-1 text-xs text-muted-foreground" title={`Edited ${formatDate(entry.edited_at)}`}>
                              (edited)
                            </span>
                          )}
                        </span>
                        {showWhoFilter && (
                          <span className="block truncate text-xs text-muted-foreground" title={entry.coordinator_name}>
                            {entry.coordinator_name}
                          </span>
                        )}
                        {entry.touches > 1 && (
                          <span className="block text-xs text-muted-foreground">latest of {entry.touches}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="line-clamp-2 break-words font-medium leading-snug" title={entry.entity_name}>
                          {entry.entity_name}
                        </p>
                        {entry.entity_bp_code && (
                          <p className="font-mono text-xs text-muted-foreground">{entry.entity_bp_code}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('max-w-full truncate', FOLLOWUP_STATUS_STYLE[entry.status])}>
                          {FOLLOWUP_STATUS_LABEL[entry.status]}
                        </Badge>
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {MODE_LABEL[entry.mode]}
                        </span>
                      </TableCell>
                      <TableCell>
                        {entry.committed_date ? (
                          <>
                            <span className="flex items-center gap-1.5 text-sm tabular-nums">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              {formatDate(entry.committed_date)}
                            </span>
                            {entry.committed_amount ? (
                              <span className="block text-xs tabular-nums text-muted-foreground">
                                {formatCurrency(entry.committed_amount)}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground opacity-50">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="line-clamp-3 break-words text-sm text-muted-foreground" title={entry.notes ?? undefined}>
                          {entry.notes || '—'}
                        </p>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {/* Offsets cancel the scrolling pane's bottom padding, so the bar sits on the screen's edge. */}
            <StickyScrollbar target={tableScroller} className="-bottom-4 md:-bottom-6" />
          </div>
        )}
      </GlassCard>
    </div>
  )
}
