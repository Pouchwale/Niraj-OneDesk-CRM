import { useEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'

/**
 * A wide table's sideways scrollbar, pinned to the bottom of the screen while
 * the table is in view.
 *
 * The table's own bar sits under its last row, so on a long list nobody could
 * reach it without scrolling to the very end. Place this right after the
 * scrolling element, inside the same parent, and hide that element's own bar
 * (`scrollbar-none`). No ancestor between here and the page's scroller may clip
 * with `overflow-hidden`, or the bar cannot stick.
 */
export function StickyScrollbar({ target, className }: { target: RefObject<HTMLElement | null>; className?: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = target.current
    const bar = barRef.current
    if (!el || !bar) return

    const measure = () => {
      setContentWidth(el.scrollWidth)
      setOverflows(el.scrollWidth > el.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)

    // Each follows the other; equal positions stop the echo.
    const fromTable = () => {
      if (bar.scrollLeft !== el.scrollLeft) bar.scrollLeft = el.scrollLeft
    }
    const fromBar = () => {
      if (el.scrollLeft !== bar.scrollLeft) el.scrollLeft = bar.scrollLeft
    }
    el.addEventListener('scroll', fromTable, { passive: true })
    bar.addEventListener('scroll', fromBar, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', fromTable)
      bar.removeEventListener('scroll', fromBar)
    }
  }, [target])

  return (
    <div
      ref={barRef}
      aria-hidden
      className={cn(
        'sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden border-t border-border bg-background/90 backdrop-blur-sm',
        // A solid thumb: the app's faint 6px bar is easy to miss on its own strip.
        '[scrollbar-color:var(--color-muted-foreground)_transparent]',
        !overflows && 'hidden',
        className
      )}
    >
      <div style={{ width: contentWidth, height: 1 }} />
    </div>
  )
}
