/**
 * The one place celebrations appear (6 Nov 2026), mounted once in the app
 * shell. It plays the full-screen celebration by itself the first time
 * someone opens the CRM on a festival day (once a day, if the administrator
 * and the person both allow it), and plays whatever Robi, the header chip or
 * the Festivals page ask for, one at a time.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { celebrate, onCelebration, type CelebrationMode, type CelebrationRequest } from './festival-bus'
import type { Festival } from './festival-calendar'
import { celebratedOn, markCelebrated, useFestivalPrefs } from './festival-prefs'
import { useFestivals } from './useFestivals'

const CelebrationStage = lazy(() => import('./CelebrationStage'))

interface Active {
  key: number
  festival: Festival
  mode: CelebrationMode
  reason: CelebrationRequest['reason']
  seconds?: number
}

export function FestivalOverlay() {
  const { user } = useAuth()
  const { config, festivals, today, primary } = useFestivals()
  const [prefs] = useFestivalPrefs(user?.id, config)
  const [active, setActive] = useState<Active | null>(null)
  const festivalsRef = useRef(festivals)
  festivalsRef.current = festivals

  // Whatever asks for a celebration replaces the one on screen.
  useEffect(
    () =>
      onCelebration((request) => {
        if (!request) {
          setActive(null)
          return
        }
        const festival = request.festival ?? festivalsRef.current.find((f) => f.id === request.festivalId)
        if (!festival) return
        setActive({ key: Date.now() + Math.random(), festival, mode: request.mode, reason: request.reason, seconds: request.seconds })
      }),
    []
  )

  // The automatic celebration: once a day per festival per person, when the tab is in front.
  const festivalId = primary?.festival.id
  const eligible = !!primary && primary.festival.auto && (primary.day === 1 || primary.festival.everyDay)
  useEffect(() => {
    if (!user || !config.enabled || !config.autoCelebrate || !prefs.auto || !festivalId || !eligible) return
    if (celebratedOn(user.id, today, festivalId)) return
    let timer = 0
    const go = () => {
      if (document.hidden) return
      document.removeEventListener('visibilitychange', go)
      timer = window.setTimeout(() => {
        if (celebratedOn(user.id, today, festivalId)) return
        markCelebrated(user.id, today, festivalId)
        celebrate({ festivalId, mode: 'full', reason: 'auto' })
      }, 1500)
    }
    if (document.hidden) document.addEventListener('visibilitychange', go)
    else go()
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', go)
    }
  }, [user, config.enabled, config.autoCelebrate, prefs.auto, festivalId, eligible, today])

  if (!active || (!config.enabled && active.reason !== 'preview')) return null
  const key = active.key
  return (
    <Suspense fallback={null}>
      <CelebrationStage
        key={key}
        festival={active.festival}
        mode={active.mode}
        reason={active.reason}
        seconds={active.seconds}
        onClose={() => setActive((a) => (a?.key === key ? null : a))}
      />
    </Suspense>
  )
}
