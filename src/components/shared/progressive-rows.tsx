/**
 * Drawing a long list a batch at a time.
 *
 * Active Payments put all 1,063 invoices on the page at once: 17,000 DOM
 * nodes for a screen that shows about fifteen rows. That was the slow first
 * paint, the lag on the first keystroke in search, and the stutter when
 * scrolling on an office machine.
 *
 * This changes what is drawn, never what is counted. The page still filters,
 * sorts and totals the whole list — every card, group header and "Showing X
 * of Y" line reads the full set. Only the rows put on screen are limited, and
 * the next batch is drawn well before the scroll reaches the end, so nobody
 * runs into a blank edge. "Show all" is always one click away, for Ctrl+F.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

export interface ProgressiveRows<T> {
  /** The rows to draw now: a prefix of the full list, in the same order. */
  visible: T[]
  total: number
  hasMore: boolean
  sentinelRef: RefObject<HTMLTableRowElement | null>
  showAll: () => void
}

const INITIAL = 120
const STEP = 200

export function useProgressiveRows<T>(
  rows: T[],
  options: { resetKey?: string; initial?: number; step?: number } = {}
): ProgressiveRows<T> {
  const initial = options.initial ?? INITIAL
  const step = options.step ?? STEP

  // Without IntersectionObserver there is no way to know when to draw more, so
  // everything is drawn: nothing may be hidden that cannot be reached. This is
  // also what the test runner gets.
  const canObserve = typeof window !== 'undefined' && 'IntersectionObserver' in window
  const [limit, setLimit] = useState(canObserve ? initial : Infinity)

  /*
   * A different question — a new search, filter, sort or window — starts again
   * at the top. A refresh of the same list keeps what is already drawn, so
   * logging a follow-up on row 400 does not throw the page back to row 120.
   */
  const lastKey = useRef(options.resetKey)
  useEffect(() => {
    if (lastKey.current === options.resetKey) return
    lastKey.current = options.resetKey
    if (canObserve) setLimit(initial)
  }, [options.resetKey, initial, canObserve])

  const hasMore = rows.length > limit
  const sentinelRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((n) => n + step)
      },
      // Far enough ahead that the next batch is drawn before it is needed.
      { rootMargin: '800px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, step, limit])

  const visible = useMemo(() => (hasMore ? rows.slice(0, limit) : rows), [rows, limit, hasMore])

  return {
    visible,
    total: rows.length,
    hasMore,
    sentinelRef,
    showAll: () => setLimit(Infinity),
  }
}

/** The last row of a partly drawn table: how much is left, and the way to all of it. */
export function MoreRowsFooter({ state, colSpan }: { state: ProgressiveRows<unknown>; colSpan: number }) {
  if (!state.hasMore) return null
  return (
    <tr ref={state.sentinelRef} data-testid="more-rows">
      <td colSpan={colSpan} className="px-4 py-3 text-center text-xs text-muted-foreground">
        {state.visible.length.toLocaleString('en-IN')} of {state.total.toLocaleString('en-IN')} on screen —
        more load as you scroll ·{' '}
        <button
          type="button"
          onClick={(event) => {
            // The row itself opens nothing, but its table might one day.
            event.stopPropagation()
            state.showAll()
          }}
          className="font-medium text-primary hover:underline"
        >
          Show all
        </button>
      </td>
    </tr>
  )
}
