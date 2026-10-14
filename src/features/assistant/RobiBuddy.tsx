/**
 * Robi: a soft, round plush buddy (since 14 Oct 2026, after the dot screen
 * was turned down). Coloured from the CRM's own indigo (index.css, --rb-*),
 * so it follows the theme. Lavender body, black bead eyes with a sparkle, pink cheeks,
 * little paws - in the family of Meta Muse's mascot and OpenAI's dots.
 *
 * Alive without being busy: it floats, blinks every few seconds, follows the
 * mouse with its eyes, beams and waves when hovered, and types on a tiny
 * keyboard while it works on an answer. Everything stops for anyone who has
 * asked for reduced motion.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type RobotMood = 'idle' | 'talking' | 'thinking' | 'happy' | 'alert' | 'sleepy'

interface RobiBuddyProps {
  mood?: RobotMood
  size?: number
  /** Eyes follow the mouse; the buddy reacts to hover. Off for the small faces in the chat. */
  interactive?: boolean
  hovered?: boolean
  className?: string
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function RobiBuddy({ mood = 'idle', size = 56, interactive = false, hovered = false, className }: RobiBuddyProps) {
  const ref = useRef<SVGSVGElement>(null)
  const uid = useId().replace(/:/g, '')
  const [still] = useState(prefersReducedMotion)
  const [blink, setBlink] = useState(false)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const lastPointer = useRef(0)

  // A blink every few seconds, at an uneven pace.
  useEffect(() => {
    if (still) return
    let timer = 0
    const next = () => {
      timer = window.setTimeout(() => {
        setBlink(true)
        window.setTimeout(() => setBlink(false), 140)
        next()
      }, 2400 + Math.random() * 3400)
    }
    next()
    return () => window.clearTimeout(timer)
  }, [still])

  // Eyes follow the mouse; left alone, Robi glances around now and then.
  useEffect(() => {
    if (still || !interactive) return
    const onMove = (e: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect()
      if (!box) return
      lastPointer.current = Date.now()
      const dx = e.clientX - (box.left + box.width / 2)
      const dy = e.clientY - (box.top + box.height / 2)
      const dist = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, dist / 220)
      setLook({ x: (dx / dist) * reach, y: (dy / dist) * reach })
    }
    const wander = window.setInterval(() => {
      if (Date.now() - lastPointer.current < 4000) return
      const spots = [{ x: 0, y: 0 }, { x: -0.8, y: 0 }, { x: 0.8, y: -0.2 }, { x: 0, y: -0.7 }, { x: 0, y: 0 }]
      setLook(spots[Math.floor(Math.random() * spots.length)])
    }, 3600)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.clearInterval(wander)
    }
  }, [interactive, still])

  const beaming = mood === 'happy' || (interactive && hovered && mood === 'idle')
  const shut = blink || mood === 'sleepy'
  // Where the pupils sit: following the mouse, or looking up while it thinks.
  const ex = mood === 'thinking' ? -1.6 : look.x * 3.2
  const ey = mood === 'thinking' ? -2.6 : look.y * 2.4
  const wide = mood === 'alert'

  return (
    <svg
      ref={ref}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn('robi-buddy', `robi-buddy-${mood}`, beaming && 'robi-buddy-beam', still && 'robi-buddy-still', className)}
    >
      <defs>
        <radialGradient id={`body-${uid}`} cx="38%" cy="30%" r="75%">
          <stop offset="0%" style={{ stopColor: 'var(--rb-hi)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--rb-mid)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--rb-lo)' }} />
        </radialGradient>
        {/* A soft, fuzzy plush edge. */}
        <filter id={`fuzz-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" />
        </filter>
      </defs>

      {/* shadow on the ground */}
      <ellipse className="robi-shadow" cx="50" cy="93" rx="25" ry="3.6" style={{ fill: 'var(--rb-shadow)' }} />

      <g className="robi-body">
        {/* ears */}
        <circle cx="29" cy="27" r="8.5" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" filter={`url(#fuzz-${uid})`} />
        <circle cx="71" cy="27" r="8.5" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" filter={`url(#fuzz-${uid})`} />
        <circle cx="29" cy="27" r="4" style={{ fill: 'var(--rb-ear)' }} opacity="0.7" />
        <circle cx="71" cy="27" r="4" style={{ fill: 'var(--rb-ear)' }} opacity="0.7" />

        {/* body */}
        <ellipse cx="50" cy="57" rx="37" ry="34" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.4" filter={`url(#fuzz-${uid})`} />
        <ellipse cx="38" cy="36" rx="11" ry="6" fill="#FFFFFF" opacity="0.55" />

        {/* cheeks */}
        <ellipse cx="28.5" cy="64" rx="6.5" ry="3.8" style={{ fill: 'var(--rb-cheek)' }} opacity={beaming ? 0.85 : 0.6} />
        <ellipse cx="71.5" cy="64" rx="6.5" ry="3.8" style={{ fill: 'var(--rb-cheek)' }} opacity={beaming ? 0.85 : 0.6} />

        {/* eyes */}
        {beaming ? (
          <g fill="none" style={{ stroke: 'var(--rb-ink)' }} strokeWidth="3" strokeLinecap="round">
            <path d="M33 56 Q38 49.5 43 56" />
            <path d="M57 56 Q62 49.5 67 56" />
          </g>
        ) : shut ? (
          <g fill="none" style={{ stroke: 'var(--rb-ink)' }} strokeWidth="2.6" strokeLinecap="round">
            <path d="M33.5 55 Q38 58.5 42.5 55" />
            <path d="M57.5 55 Q62 58.5 66.5 55" />
          </g>
        ) : (
          <g className="robi-eyes" transform={`translate(${ex} ${ey})`}>
            <ellipse cx="38" cy="54" rx={wide ? 5.6 : 4.4} ry={wide ? 6.6 : 5.4} style={{ fill: 'var(--rb-ink)' }} />
            <ellipse cx="62" cy="54" rx={wide ? 5.6 : 4.4} ry={wide ? 6.6 : 5.4} style={{ fill: 'var(--rb-ink)' }} />
            <circle cx="39.6" cy="51.8" r="1.6" fill="#FFFFFF" />
            <circle cx="63.6" cy="51.8" r="1.6" fill="#FFFFFF" />
          </g>
        )}

        {/* mouth */}
        {beaming ? (
          <g>
            <path d="M43.5 63 Q50 72 56.5 63 Z" style={{ fill: 'var(--rb-mouth)' }} />
            <path d="M46.5 66.8 Q50 69.6 53.5 66.8 Q50 65.6 46.5 66.8 Z" style={{ fill: 'var(--rb-tongue)' }} />
          </g>
        ) : mood === 'talking' ? (
          <ellipse className="robi-talk" cx="50" cy="65.5" rx="3.6" ry="2.8" style={{ fill: 'var(--rb-mouth)' }} />
        ) : mood === 'alert' ? (
          <ellipse cx="50" cy="67" rx="2.6" ry="3" style={{ fill: 'var(--rb-mouth)' }} />
        ) : mood === 'sleepy' ? (
          <path d="M47 66 Q50 67.5 53 66" fill="none" style={{ stroke: 'var(--rb-mouth)' }} strokeWidth="2" strokeLinecap="round" />
        ) : mood === 'thinking' ? (
          <path d="M46.5 66 Q50 64.6 53.5 66.4" fill="none" style={{ stroke: 'var(--rb-mouth)' }} strokeWidth="2.2" strokeLinecap="round" />
        ) : (
          <path d="M45 63.5 Q50 68.5 55 63.5" fill="none" style={{ stroke: 'var(--rb-mouth)' }} strokeWidth="2.4" strokeLinecap="round" />
        )}

        {/* paws: wave when beaming, type when thinking */}
        {mood === 'thinking' ? (
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
        ) : (
          <g>
            <circle cx="19" cy="70" r="5.2" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
            <circle className={beaming ? 'robi-paw-wave' : undefined} cx="81" cy="70" r="5.2" fill={`url(#body-${uid})`} style={{ stroke: 'var(--rb-edge)' }} strokeWidth="1.2" />
          </g>
        )}

        {/* alert: a little sweat drop */}
        {mood === 'alert' && <path d="M76 40 Q79 45 76 47.5 Q73 45 76 40 Z" fill="#8FD3FF" stroke="#5DB6EE" strokeWidth="0.8" />}
      </g>

      {/* sleepy: floating z's */}
      {mood === 'sleepy' && (
        <g className="robi-zz" style={{ fill: 'var(--color-primary)' }} fontFamily="ui-rounded, system-ui, sans-serif" fontWeight="700">
          <text x="76" y="24" fontSize="11">z</text>
          <text x="84" y="14" fontSize="8">z</text>
        </g>
      )}
    </svg>
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
