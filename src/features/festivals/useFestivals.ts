/**
 * The festival state every festive screen reads (6 Nov 2026): the
 * administrator's settings, today's date in India (it rolls over at midnight
 * IST), today's festivals and the countdown to the next big one.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { DEFAULT_FESTIVAL_CONFIG } from '@/lib/festival-config'
import type { FestivalConfig } from '@/lib/types'
import { comingSoon, festivalsOn, istDate, resolveFestivals, type Festival, type FestivalDay, type UpcomingFestival } from './festival-calendar'

export function useFestivalConfig(): FestivalConfig {
  const saved = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.festivalConfig)
  return saved ?? DEFAULT_FESTIVAL_CONFIG
}

/** Today's date in India; changes by itself at midnight IST. */
export function useIstToday(): string {
  const [today, setToday] = useState(() => istDate())
  useEffect(() => {
    const tick = () => setToday(istDate())
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

export interface FestivalState {
  config: FestivalConfig
  today: string
  festivals: Festival[]
  /** Today's festivals, the one to celebrate first; empty when festivals are switched off. */
  todays: FestivalDay[]
  primary: FestivalDay | null
  /** The next major festival inside the countdown window. */
  soon: UpcomingFestival | null
}

export function useFestivals(): FestivalState {
  const config = useFestivalConfig()
  const today = useIstToday()
  const festivals = useMemo(() => resolveFestivals(config), [config])
  const todays = useMemo(() => (config.enabled ? festivalsOn(today, festivals) : []), [config.enabled, today, festivals])
  const soon = useMemo(
    () => (config.enabled && !todays.length ? comingSoon(today, festivals, config.countdownDays) : null),
    [config.enabled, config.countdownDays, today, festivals, todays.length]
  )
  return { config, today, festivals, todays, primary: todays[0] ?? null, soon }
}

/** The computer asks for less motion: animations become still pictures. */
export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')
