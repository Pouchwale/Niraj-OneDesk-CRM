import { useEffect, useState } from 'react'

/**
 * A clock that keeps running while the page sits open.
 *
 * Anything drawn from `new Date()` at render time freezes until something
 * else re-renders it, so a banner showing the time is wrong within a minute
 * and stays wrong until the tab is reloaded.
 *
 * Two details make it honest rather than merely ticking:
 *
 *  - it wakes on the boundary, not every second, so a clock showing minutes
 *    changes exactly as the minute turns and costs one render an hour when
 *    showing hours;
 *  - it catches up when the tab comes back. A hidden tab has its timers
 *    throttled and a sleeping machine stops them altogether, so returning to
 *    a page could otherwise show the time it was when you left.
 */

/** Milliseconds until the next whole step, so ticks land on the boundary. */
export function msUntilNextStep(now: number, stepMs: number): number {
  if (stepMs <= 0) return 0
  const remainder = now % stepMs
  return stepMs - remainder
}

export function useNow(stepMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number | undefined

    const schedule = () => {
      // A few milliseconds past the boundary, so the formatted value has
      // definitely rolled over by the time it is read.
      timer = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, msUntilNextStep(Date.now(), stepMs) + 20)
    }

    const catchUp = () => {
      if (document.visibilityState === 'hidden') return
      setNow(new Date())
      if (timer !== undefined) window.clearTimeout(timer)
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('focus', catchUp)

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('focus', catchUp)
    }
  }, [stepMs])

  return now
}
