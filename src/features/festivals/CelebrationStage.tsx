/**
 * One celebration on screen (6 Nov 2026). Full: the festival's backdrop and
 * animation over the whole CRM with Robi's greeting card (celebrate again,
 * music, sound, about, share, close). Ambient: the lighter effects over the
 * page while work carries on, with a small Stop pill.
 *
 * Loaded only when a celebration starts. All effects are drawn and
 * synthesised in the browser; nothing outside the screen and speakers is
 * ever touched (no vibration, no devices).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Info, Music2, RotateCcw, Share2, Square, Volume2, VolumeX, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthContext'
import { RobiBuddy } from '@/features/assistant/RobiBuddy'
import { cn } from '@/lib/utils'
import { playCue, playFanfare, playMusic, speak, stopSpeaking, unlockSound } from './festival-audio'
import { celebrate, openFestivalPanel, type CelebrationMode, type CelebrationRequest } from './festival-bus'
import { dayLabel, festivalLine, festivalsOn, longDate, navratriColour, nextSpan, type Festival } from './festival-calendar'
import { FestivalScene, INTENSITY_DENSITY } from './festival-effects'
import { useFestivalPrefs } from './festival-prefs'
import { strongColours, THEMES } from './festival-themes'
import { FestiveAccessory } from './FestiveAccessory'
import { FestivalArt, hasFestivalArt } from './FestivalArt'
import { useFestivals, useReducedMotion } from './useFestivals'

export interface CelebrationStageProps {
  festival: Festival
  mode: CelebrationMode
  reason: CelebrationRequest['reason']
  seconds?: number
  onClose: () => void
}

const PARTY = { id: 1, kind: 'party' as const }

export default function CelebrationStage({ festival, mode, reason, seconds, onClose }: CelebrationStageProps) {
  const { user } = useAuth()
  const { config, today, festivals } = useFestivals()
  const [prefs, setPrefs] = useFestivalPrefs(user?.id, config)
  const reduced = useReducedMotion()
  const theme = THEMES[festival.theme]
  const full = mode === 'full'

  const fd = useMemo(() => festivalsOn(today, festivals).find((d) => d.festival.id === festival.id) ?? null, [today, festivals, festival.id])
  const span = fd ? null : nextSpan(festival, today)
  const firstName = user?.full_name.split(' ')[0] ?? ''
  const line = useMemo(() => festivalLine(festival, firstName, today, fd), [festival, firstName, today, fd])
  const label = fd ? dayLabel(fd) : null
  const colour = fd ? navratriColour(fd) : null

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<FestivalScene | null>(null)
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [about, setAbout] = useState(false)
  const [music, setMusic] = useState(false)
  const stopMusic = useRef<() => void>(() => {})
  const closingRef = useRef(false)
  /** The person is using the card: no closing by itself. */
  const pinned = useRef(false)
  const deadline = useRef(0)

  const soundOn = !prefs.muted
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const voiceOn = soundOn && config.voice && prefs.voice

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    stopMusic.current()
    stopSpeaking()
    const scene = sceneRef.current
    if (scene) scene.stop(onClose, 700)
    // If the tab is hidden the fade never runs: close anyway.
    window.setTimeout(onClose, 1100)
  }, [onClose])

  // The animation.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const density = INTENSITY_DENSITY[config.intensity] * (prefs.calm ? 0.6 : 1) * (full ? 1 : 0.85)
    const scene = new FestivalScene(canvas, full ? theme.full : theme.ambient, {
      density,
      reduced,
      onSound: (cue) => {
        if (soundRef.current) playCue(cue)
      },
    })
    sceneRef.current = scene
    scene.start()
    const id = window.requestAnimationFrame(() => setShown(true))
    return () => {
      window.cancelAnimationFrame(id)
      scene.destroy()
      sceneRef.current = null
    }
    // One scene per celebration: the overlay mounts a fresh stage for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The opening sound and Robi's greeting. Browsers allow sound only after a click: if it is not allowed yet, offer a button.
  useEffect(() => {
    if (!soundOn) return
    let cancelled = false
    const tooLate = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 450))
    void Promise.race([unlockSound(), tooLate]).then((ok) => {
      if (cancelled) return
      if (ok) {
        playFanfare(theme.fanfare)
        if (full && voiceOn) window.setTimeout(() => speak(line), 700)
      } else if (full) {
        setNeedsTap(true)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Closes by itself after its time, unless the person is using the card; a tap on the screen adds a little time.
  useEffect(() => {
    const total = (seconds ?? (full ? config.durationSec : 8)) * 1000 * (prefs.calm ? 0.7 : 1)
    deadline.current = Date.now() + total
    const id = window.setInterval(() => {
      if (!pinned.current && Date.now() > deadline.current) close()
    }, 400)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc closes the full celebration.
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full, close])

  useEffect(() => () => stopMusic.current(), [])

  const tapForSound = async () => {
    pinned.current = true
    if (await unlockSound()) {
      setNeedsTap(false)
      playFanfare(theme.fanfare)
      if (voiceOn) speak(line)
    }
  }

  const toggleMusic = async () => {
    pinned.current = true
    if (music) {
      stopMusic.current()
      stopMusic.current = () => {}
      setMusic(false)
      return
    }
    if (prefs.muted) setPrefs({ muted: false })
    if (!(await unlockSound())) return
    setNeedsTap(false)
    stopMusic.current = playMusic(theme.music)
    setMusic(true)
  }

  const toggleMute = () => {
    pinned.current = true
    if (!prefs.muted) {
      stopMusic.current()
      setMusic(false)
      stopSpeaking()
    } else {
      void unlockSound()
    }
    setPrefs({ muted: !prefs.muted })
  }

  const toggleAbout = () => {
    pinned.current = true
    const next = !about
    setAbout(next)
    if (next && voiceOn) speak(festival.about)
    else stopSpeaking()
  }

  const again = () => celebrate({ festivalId: festival.id, mode: 'full', reason: 'user' })

  if (!full) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[55]" aria-live="polite">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div
          className={cn(
            'pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/70 bg-background/90 py-1.5 pl-3 pr-1.5 text-sm shadow-lg backdrop-blur transition-opacity duration-500',
            shown && !closing ? 'opacity-100' : 'opacity-0'
          )}
        >
          {hasFestivalArt(festival.id) ? <FestivalArt festivalId={festival.id} size={22} /> : <span aria-hidden>{festival.emoji}</span>}
          <span className="font-medium">{festival.salutation}!</span>
          <button type="button" onClick={close} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Stop the animation">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  const [c1, c2, c3] = strongColours(theme)
  const gradient = `linear-gradient(90deg, ${c1}, ${c2}, ${c3})`

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label={`${festival.name} celebration`}>
      <div className="absolute inset-0 transition-opacity duration-700" style={{ background: theme.backdrop, opacity: shown && !closing ? 1 : 0 }} />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-pointer"
        onPointerDown={(e) => {
          sceneRef.current?.burstAt(e.clientX, e.clientY)
          deadline.current = Math.max(deadline.current, Date.now() + 4000)
        }}
        aria-hidden
      />

      {/* The festival's deity or characters, at the heart of the celebration. */}
      {hasFestivalArt(festival.id) && (
        <div
          className={cn(
            'pointer-events-none absolute left-1/2 top-[5vh] -translate-x-1/2 transition-all duration-1000 ease-out',
            shown && !closing ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          )}
          style={{ width: 'min(46vh, 340px)' }}
        >
          <div className="festive-rays absolute -inset-[30%] rounded-full" aria-hidden />
          <div className="festive-float relative drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
            <FestivalArt festivalId={festival.id} size={340} className="h-auto w-full" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={close}
        className={cn(
          'absolute right-4 top-4 rounded-full border border-white/30 bg-black/30 p-2 text-white backdrop-blur transition-opacity duration-500 hover:bg-black/50',
          shown && !closing ? 'opacity-100' : 'opacity-0'
        )}
        aria-label="Close the celebration"
        title="Close (Esc)"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-8">
        <div
          className={cn(
            'pointer-events-auto w-full max-w-lg rounded-3xl border border-border/60 bg-background/90 p-4 shadow-2xl backdrop-blur-xl transition-all duration-700 sm:p-5',
            shown && !closing ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          )}
          onPointerDown={() => (pinned.current = true)}
        >
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <RobiBuddy mood="happy" size={64} reaction={reduced ? null : PARTY} />
              <span className="pointer-events-none absolute -left-2 -top-2">
                <FestiveAccessory kind={theme.accessory} size={28} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {festival.name}
                {festival.alt ? ` · ${festival.alt}` : ''}
              </p>
              <h2 className="bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl" style={{ backgroundImage: gradient }}>
                {festival.salutation}!{' '}
                {/* The drawing above already shows the festival; the emoji is for festivals without one. */}
                {!hasFestivalArt(festival.id) && <span className="text-foreground">{festival.emoji}</span>}
              </h2>
              <p className="mt-1 text-sm leading-snug" aria-live="polite">
                {line}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {fd ? (
                  <span>Today, {longDate(today)}</span>
                ) : span ? (
                  <span>
                    Coming up on {longDate(span.start)} · {span.inDays === 1 ? 'tomorrow' : `in ${span.inDays} days`}
                  </span>
                ) : null}
                {label && <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{label}</span>}
                {colour && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: colour.hex }} />
                    {colour.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {about && (
            <div className="mt-3 max-h-48 space-y-2 overflow-auto rounded-2xl bg-muted/50 p-3 text-sm leading-relaxed">
              <p>{festival.about}</p>
              {festival.traditions.length > 0 && (
                <ul className="list-inside list-disc text-muted-foreground">
                  {festival.traditions.slice(0, 4).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {needsTap && (
              <Button size="sm" onClick={() => void tapForSound()} className="gap-1.5" style={{ background: theme.accent }}>
                <Volume2 className="h-4 w-4" /> Tap for sound
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={again} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Celebrate again
            </Button>
            {config.music && (
              <Button size="sm" variant="outline" onClick={() => void toggleMusic()} className="gap-1.5" aria-pressed={music}>
                {music ? <Square className="h-3.5 w-3.5" /> : <Music2 className="h-4 w-4" />} {music ? 'Stop music' : 'Music'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={toggleAbout} className="gap-1.5" aria-pressed={about}>
              <Info className="h-4 w-4" /> About
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                close()
                openFestivalPanel(festival.id)
              }}
              className="gap-1.5"
            >
              <Share2 className="h-4 w-4" /> Wishes
            </Button>
            <Button size="sm" variant="ghost" onClick={toggleMute} className="ml-auto gap-1.5" aria-label={prefs.muted ? 'Turn sound on' : 'Mute sound'} title={prefs.muted ? 'Sound is off' : 'Sound is on'}>
              {prefs.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
          {reason === 'auto' && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Plays once a day on festivals. Turn it off for yourself on the Festivals page.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
