/**
 * Robi: a soft, round plush buddy (since 14 Oct 2026). Coloured from the
 * CRM's own indigo (index.css, --rb-*), so it follows the theme.
 *
 * Alive, the way Meta Muse's and OpenAI's mascots are: the whole body leans
 * on springs toward the mouse and the ears lag behind it; it blinks, looks
 * around, yawns and stretches when left alone; beams and waves when hovered;
 * looks down at the box while you type; types on a tiny keyboard while it
 * works; and reacts to what happens in the CRM - a sparkle burst and a jump
 * when a task is done, confetti when the day is finished, a wink, spin or
 * hearts when it is booped. Everything stops for anyone who has asked their
 * system for reduced motion.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { cn } from '@/lib/utils'

export type RobotMood = 'idle' | 'talking' | 'thinking' | 'happy' | 'alert' | 'sleepy' | 'listening'

/** Something Robi should do right now; a new id plays it again. */
export interface RobiReaction {
  id: number
  kind: 'boop' | 'celebrate' | 'party'
}

interface RobiBuddyProps {
  mood?: RobotMood
  size?: number
  /** Eyes follow the mouse, the body leans, idle habits run. Off for the small faces in the chat. */
  interactive?: boolean
  hovered?: boolean
  /** Being dragged about: wide eyes, no leaning. */
  dragging?: boolean
  reaction?: RobiReaction | null
  /** A short line in a chip above Robi's head. */
  say?: string | null
  /** The soft glow behind the corner Robi. */
  aura?: boolean
  className?: string
}

type Particle = { id: number; kind: 'sparkle' | 'heart' | 'confetti'; dx: number; dy: number; delay: number; rot: number; hue: string }
type IdleAct = 'yawn' | 'stretch' | 'wink' | 'ears' | null
type Boop = 'wink' | 'spin' | 'hearts' | 'jiggle'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let particleSeq = 0
const CONFETTI = ['var(--color-primary)', 'var(--rb-cheek)', 'var(--rb-tongue)', 'oklch(0.8 0.15 90)', 'oklch(0.75 0.15 160)', 'oklch(0.72 0.17 230)']

function burst(kind: Particle['kind'], count: number, spread: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6
    const reach = spread * (0.6 + Math.random() * 0.6)
    return {
      id: ++particleSeq,
      kind,
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach - (kind === 'confetti' ? spread * 0.5 : 0),
      delay: Math.random() * 0.12,
      rot: Math.round(Math.random() * 720 - 360),
      hue: CONFETTI[i % CONFETTI.length],
    }
  })
}

export function RobiBuddy({
  mood = 'idle',
  size = 56,
  interactive = false,
  hovered = false,
  dragging = false,
  reaction = null,
  say = null,
  aura = false,
  className,
}: RobiBuddyProps) {
  const ref = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/:/g, '')
  const [still] = useState(prefersReducedMotion)
  const [blink, setBlink] = useState(false)
  const [idleAct, setIdleAct] = useState<IdleAct>(null)
  const [boop, setBoop] = useState<Boop | null>(null)
  const [cheer, setCheer] = useState<'celebrate' | 'party' | null>(null)
  const [particles, setParticles] = useState<Particle[]>([])
  const lastPointer = useRef(0)
  const playedReaction = useRef<number | null>(null)

  /*
   * Where Robi is looking, as -1..1 in each axis. The pupils take it almost
   * raw; the body leans after it on a stiff spring and the ears on a soft
   * one, so a sweep of the mouse rolls through Robi like a wave.
   */
  const lookX = useMotionValue(0)
  const lookY = useMotionValue(0)
  const pupilX = useSpring(useTransform(lookX, (v) => v * 3.4), { stiffness: 420, damping: 28 })
  const pupilY = useSpring(useTransform(lookY, (v) => v * 2.6), { stiffness: 420, damping: 28 })
  const bodyX = useSpring(useTransform(lookX, (v) => v * size * 0.06), { stiffness: 160, damping: 14 })
  const bodyY = useSpring(useTransform(lookY, (v) => v * size * 0.04), { stiffness: 160, damping: 14 })
  const lean = useSpring(useTransform(lookX, (v) => v * 7), { stiffness: 140, damping: 12 })
  const earX = useSpring(useTransform(lookX, (v) => v * -2.4), { stiffness: 90, damping: 9 })
  const earY = useSpring(useTransform(lookY, (v) => v * -1.6), { stiffness: 90, damping: 9 })

  // A blink every few seconds, at an uneven pace; a double blink now and then.
  useEffect(() => {
    if (still) return
    let timer = 0
    const next = () => {
      timer = window.setTimeout(() => {
        setBlink(true)
        window.setTimeout(() => setBlink(false), 130)
        if (Math.random() < 0.2) {
          window.setTimeout(() => setBlink(true), 260)
          window.setTimeout(() => setBlink(false), 390)
        }
        next()
      }, 2400 + Math.random() * 3400)
    }
    next()
    return () => window.clearTimeout(timer)
  }, [still])

  // Eyes and body follow the mouse; left alone, Robi glances around now and then.
  useEffect(() => {
    if (still || !interactive) return
    const onMove = (e: PointerEvent) => {
      if (dragging) return
      const box = ref.current?.getBoundingClientRect()
      if (!box) return
      lastPointer.current = Date.now()
      const dx = e.clientX - (box.left + box.width / 2)
      const dy = e.clientY - (box.top + box.height / 2)
      const dist = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, dist / 260)
      lookX.set((dx / dist) * reach)
      lookY.set((dy / dist) * reach)
    }
    const wander = window.setInterval(() => {
      if (Date.now() - lastPointer.current < 4000) return
      const spots = [[0, 0], [-0.8, 0.1], [0.8, -0.2], [0.2, -0.7], [0, 0], [-0.4, 0.4]]
      const [x, y] = spots[Math.floor(Math.random() * spots.length)]
      lookX.set(x)
      lookY.set(y)
    }, 3600)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.clearInterval(wander)
    }
  }, [interactive, still, dragging, lookX, lookY])

  // Left alone with nothing to do, Robi has habits: a yawn, a stretch, a wink, an ear wiggle.
  useEffect(() => {
    if (still || !interactive || mood !== 'idle') return
    let timer = 0
    const next = () => {
      timer = window.setTimeout(() => {
        if (Date.now() - lastPointer.current > 6000 && !hovered) {
          const acts: IdleAct[] = ['yawn', 'stretch', 'wink', 'ears', 'ears']
          const act = acts[Math.floor(Math.random() * acts.length)]
          setIdleAct(act)
          window.setTimeout(() => setIdleAct(null), act === 'yawn' ? 1600 : act === 'wink' ? 500 : 900)
        }
        next()
      }, 9000 + Math.random() * 9000)
    }
    next()
    return () => window.clearTimeout(timer)
  }, [interactive, still, mood, hovered])

  // Reactions asked for from outside: each new id plays once.
  useEffect(() => {
    if (!reaction || playedReaction.current === reaction.id) return
    playedReaction.current = reaction.id
    const spread = size * 0.9
    if (reaction.kind === 'boop') {
      const picks: Boop[] = ['wink', 'spin', 'hearts', 'jiggle']
      const pick = picks[Math.floor(Math.random() * picks.length)]
      setBoop(pick)
      if (pick === 'hearts') setParticles((p) => [...p, ...burst('heart', 6, spread)])
      if (pick === 'spin' || pick === 'jiggle') setParticles((p) => [...p, ...burst('sparkle', 6, spread * 0.8)])
      window.setTimeout(() => setBoop(null), pick === 'spin' ? 900 : 700)
    } else if (reaction.kind === 'celebrate') {
      setCheer('celebrate')
      setParticles((p) => [...p, ...burst('sparkle', 10, spread)])
      window.setTimeout(() => setCheer(null), 2400)
    } else {
      setCheer('party')
      setParticles((p) => [...p, ...burst('confetti', 18, spread * 1.3), ...burst('sparkle', 8, spread)])
      window.setTimeout(() => setCheer(null), 4000)
    }
  }, [reaction, size])

  // Particles clear themselves once their animation is over.
  useEffect(() => {
    if (particles.length === 0) return
    const id = window.setTimeout(() => setParticles([]), 1800)
    return () => window.clearTimeout(id)
  }, [particles])

  /* ----- what the face shows ----- */
  const beaming = cheer !== null || mood === 'happy' || (interactive && hovered && mood === 'idle' && !dragging)
  const winking = boop === 'wink' || idleAct === 'wink'
  const shut = (blink && !beaming) || mood === 'sleepy' || idleAct === 'yawn'
  const wide = mood === 'alert' || dragging || boop === 'spin'
  const typing = mood === 'thinking'
  const listening = mood === 'listening'
  const eyeKind = beaming ? 'beam' : winking ? 'wink' : shut ? 'shut' : wide ? 'wide' : 'open'

  // Where the pupils rest when something other than the mouse has Robi's attention.
  const fixedGaze = typing ? { x: -1.8, y: -2.8 } : listening ? { x: 0, y: 3 } : dragging ? { x: 0, y: -1.5 } : null

  const mouth = beaming
    ? 'grin'
    : idleAct === 'yawn'
      ? 'yawn'
      : mood === 'talking'
        ? 'talk'
        : mood === 'alert' || dragging || boop === 'spin'
          ? 'o'
          : mood === 'sleepy'
            ? 'sleepy'
            : typing
              ? 'flat'
              : listening
                ? 'small'
                : 'smile'

  // The reaction layer: jumps, spins and stretches on their own element, so
  // they never fight the lean springs or the float keyframes.
  const act =
    cheer === 'party'
      ? { y: [0, -size * 0.34, 0, -size * 0.18, 0, -size * 0.08, 0], rotate: [0, -10, 0, 8, 0, -4, 0], scaleX: [1, 0.92, 1.08, 0.96, 1.04, 1, 1] }
      : cheer === 'celebrate'
        ? { y: [0, -size * 0.26, 0, -size * 0.1, 0], scaleX: [1, 0.94, 1.06, 0.98, 1], scaleY: [1, 1.08, 0.94, 1.02, 1] }
        : boop === 'spin'
          ? { rotate: [0, 360], scale: [1, 1.12, 1] }
          : boop === 'jiggle'
            ? { scaleX: [1, 1.18, 0.88, 1.1, 0.95, 1], scaleY: [1, 0.86, 1.12, 0.92, 1.04, 1] }
            : idleAct === 'stretch'
              ? { scaleY: [1, 1.12, 0.96, 1], scaleX: [1, 0.94, 1.03, 1], y: [0, -size * 0.04, 0, 0] }
              : { y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1 }

  const actTransition =
    cheer === 'party'
      ? { duration: 1.5, ease: 'easeOut' as const }
      : cheer === 'celebrate'
        ? { duration: 0.9, ease: 'easeOut' as const }
        : boop === 'spin'
          ? { duration: 0.8, ease: [0.3, 0, 0.2, 1] as [number, number, number, number] }
          : { duration: 0.6, ease: 'easeInOut' as const }

  return (
    <div ref={ref} className={cn('robi-wrap relative', className)} style={{ width: size, height: size }}>
      {aura && <div className={cn('robi-aura', beaming && 'robi-aura-bright')} aria-hidden="true" />}

      {/* Sparkles, hearts and confetti, flung out from the middle. */}
      <div className="robi-fx" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className={cn('robi-particle', `robi-particle-${p.kind}`)}
            style={
              {
                '--p-dx': `${p.dx}px`,
                '--p-dy': `${p.dy}px`,
                '--p-delay': `${p.delay}s`,
                '--p-rot': `${p.rot}deg`,
                '--p-color': p.hue,
              } as React.CSSProperties
            }
          >
            {p.kind === 'heart' ? '♥' : ''}
          </span>
        ))}
        {beaming && !still && (
          <>
            <span className="robi-twinkle" style={{ left: '8%', top: '18%', animationDelay: '0s' }} />
            <span className="robi-twinkle" style={{ left: '86%', top: '12%', animationDelay: '0.5s' }} />
            <span className="robi-twinkle" style={{ left: '92%', top: '62%', animationDelay: '1s' }} />
          </>
        )}
      </div>

      {/* The chip: a word or two above Robi's head. */}
      <AnimatePresence>
        {say && (
          <motion.div
            key={say}
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            className="robi-chip"
            aria-hidden="true"
          >
            {say}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lean layer: follows the mouse on springs. */}
      <motion.div
        className="h-full w-full"
        style={still || dragging ? undefined : { x: bodyX, y: bodyY, rotate: lean }}
      >
        {/* Reaction layer: jumps, spins, stretches. */}
        <motion.div className="h-full w-full" animate={still ? undefined : act} transition={actTransition}>
          <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            aria-hidden="true"
            className={cn('robi-buddy', `robi-buddy-${mood}`, beaming && 'robi-buddy-beam', still && 'robi-buddy-still', idleAct === 'ears' && 'robi-buddy-ears')}
          >
            <defs>
              <radialGradient id={`body-${uid}`} cx="38%" cy="30%" r="75%">
                <stop offset="0%" style={{ stopColor: 'var(--rb-hi)' }} />
                <stop offset="55%" style={{ stopColor: 'var(--rb-mid)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--rb-lo)' }} />
              </radialGradient>
              <radialGradient id={`sheen-${uid}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </radialGradient>
              <filter id={`fuzz-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" />
              </filter>
            </defs>

            <ellipse className="robi-shadow" cx="50" cy="93" rx="25" ry="3.6" style={{ fill: 'var(--rb-shadow)' }} />

            <g className="robi-body">
              {/* ears lag behind the body on a softer spring */}
              <motion.g className="robi-ears" style={still ? undefined : { x: earX, y: earY }}>
                <circle cx="29" cy="27" r="8.5" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" filter={`url(#fuzz-${uid})`} />
                <circle cx="71" cy="27" r="8.5" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" filter={`url(#fuzz-${uid})`} />
                <circle cx="29" cy="27" r="4" style={{ fill: 'var(--rb-ear)' }} opacity="0.7" />
                <circle cx="71" cy="27" r="4" style={{ fill: 'var(--rb-ear)' }} opacity="0.7" />
              </motion.g>

              <ellipse cx="50" cy="57" rx="37" ry="34" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.4" filter={`url(#fuzz-${uid})`} />
              <ellipse cx="38" cy="36" rx="12" ry="7" fill={`url(#sheen-${uid})`} />

              <ellipse cx="28.5" cy="64" rx="6.5" ry="3.8" style={{ fill: 'var(--rb-cheek)' }} opacity={beaming ? 0.9 : 0.6} />
              <ellipse cx="71.5" cy="64" rx="6.5" ry="3.8" style={{ fill: 'var(--rb-cheek)' }} opacity={beaming ? 0.9 : 0.6} />

              {/* eyes */}
              {eyeKind === 'beam' ? (
                <g fill="none" style={{ stroke: 'var(--rb-ink)' }} strokeWidth="3" strokeLinecap="round">
                  <path d="M33 56 Q38 49.5 43 56" />
                  <path d="M57 56 Q62 49.5 67 56" />
                </g>
              ) : eyeKind === 'shut' ? (
                <g fill="none" style={{ stroke: 'var(--rb-ink)' }} strokeWidth="2.6" strokeLinecap="round">
                  <path d="M33.5 55 Q38 58.5 42.5 55" />
                  <path d="M57.5 55 Q62 58.5 66.5 55" />
                </g>
              ) : (
                <motion.g
                  className="robi-eyes"
                  style={
                    fixedGaze || still
                      ? { x: fixedGaze?.x ?? 0, y: fixedGaze?.y ?? 0 }
                      : { x: pupilX, y: pupilY }
                  }
                >
                  {eyeKind === 'wink' ? (
                    <path d="M33.5 55 Q38 58.5 42.5 55" fill="none" style={{ stroke: 'var(--rb-ink)' }} strokeWidth="2.6" strokeLinecap="round" />
                  ) : (
                    <>
                      <ellipse cx="38" cy="54" rx={wide ? 5.6 : 4.4} ry={wide ? 6.6 : 5.4} style={{ fill: 'var(--rb-ink)' }} />
                      <circle cx="39.6" cy="51.8" r="1.6" fill="#FFFFFF" />
                    </>
                  )}
                  <ellipse cx="62" cy="54" rx={wide ? 5.6 : 4.4} ry={wide ? 6.6 : 5.4} style={{ fill: 'var(--rb-ink)' }} />
                  <circle cx="63.6" cy="51.8" r="1.6" fill="#FFFFFF" />
                </motion.g>
              )}

              {/* mouth */}
              {mouth === 'grin' ? (
                <g>
                  <path d="M43.5 63 Q50 72 56.5 63 Z" style={{ fill: 'var(--rb-mouth)' }} />
                  <path d="M46.5 66.8 Q50 69.6 53.5 66.8 Q50 65.6 46.5 66.8 Z" style={{ fill: 'var(--rb-tongue)' }} />
                </g>
              ) : mouth === 'yawn' ? (
                <ellipse cx="50" cy="67" rx="4.2" ry="5" style={{ fill: 'var(--rb-mouth)' }} />
              ) : mouth === 'talk' ? (
                <ellipse className="robi-talk" cx="50" cy="65.5" rx="3.6" ry="2.8" style={{ fill: 'var(--rb-mouth)' }} />
              ) : mouth === 'o' ? (
                <ellipse cx="50" cy="67" rx="2.6" ry="3" style={{ fill: 'var(--rb-mouth)' }} />
              ) : mouth === 'sleepy' ? (
                <path d="M47 66 Q50 67.5 53 66" fill="none" style={{ stroke: 'var(--rb-mouth)' }} strokeWidth="2" strokeLinecap="round" />
              ) : mouth === 'flat' ? (
                <path d="M46.5 66 Q50 64.6 53.5 66.4" fill="none" style={{ stroke: 'var(--rb-mouth)' }} strokeWidth="2.2" strokeLinecap="round" />
              ) : mouth === 'small' ? (
                <path d="M47 64.5 Q50 67 53 64.5" fill="none" style={{ stroke: 'var(--rb-mouth)' }} strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M45 63.5 Q50 68.5 55 63.5" fill="none" style={{ stroke: 'var(--rb-mouth)' }} strokeWidth="2.4" strokeLinecap="round" />
              )}

              {/* paws: a keyboard while thinking; a wave when beaming; up in the air when dragged */}
              {typing ? (
                <g>
                  <rect x="31" y="80" width="38" height="8" rx="2.5" style={{ fill: 'var(--color-primary)' }} />
                  <g style={{ fill: 'var(--rb-hi)' }}>
                    {[35, 40, 45, 50, 55, 60].map((x) => (
                      <rect key={x} x={x} y="81.6" width="3.4" height="2" rx="0.6" />
                    ))}
                  </g>
                  <circle className="robi-paw-type-l" cx="40" cy="79" r="4.6" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
                  <circle className="robi-paw-type-r" cx="60" cy="79" r="4.6" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
                </g>
              ) : dragging ? (
                <g>
                  <circle cx="17" cy="52" r="5.2" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
                  <circle cx="83" cy="52" r="5.2" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
                </g>
              ) : (
                <g>
                  <circle cx="19" cy="70" r="5.2" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
                  <circle className={beaming ? 'robi-paw-wave' : undefined} cx="81" cy="70" r="5.2" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
                </g>
              )}

              {(mood === 'alert' || dragging) && <path d="M76 40 Q79 45 76 47.5 Q73 45 76 40 Z" fill="#8FD3FF" stroke="#5DB6EE" strokeWidth="0.8" />}
            </g>

            {(mood === 'sleepy' || idleAct === 'yawn') && (
              <g className="robi-zz" style={{ fill: 'var(--color-primary)' }} fontFamily="ui-rounded, system-ui, sans-serif" fontWeight="700">
                <text x="76" y="24" fontSize="11">z</text>
                <text x="84" y="14" fontSize="8">z</text>
              </g>
            )}
          </svg>
        </motion.div>
      </motion.div>
    </div>
  )
}

/** Three dots that bounce in turn while Robi works on an answer. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn('robi-typing inline-flex items-center gap-1', className)} role="status" aria-label="Robi is thinking">
      <span />
      <span />
      <span />
    </span>
  )
}
