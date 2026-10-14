/**
 * Robi's face: a little screen of dots (since 14 Oct 2026). Lit dots draw the
 * eyes and the mouth; every expression is just a different set of lit dots,
 * so moving between moods is a soft cross-fade, not a cut.
 *
 * Alive without being busy: it blinks every few seconds, glances around when
 * left alone, follows the mouse with its eyes, and smiles when hovered. All of
 * that stops for anyone who has asked their system for reduced motion.
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type RobotMood = 'idle' | 'talking' | 'thinking' | 'happy' | 'alert' | 'sleepy'

const COLS = 9
const ROWS = 7

interface DotFaceProps {
  mood?: RobotMood
  /** Width in pixels; the screen is a rounded square. */
  size?: number
  /** Eyes follow the mouse and the face reacts to hover. Off for small, repeated faces. */
  interactive?: boolean
  /** Look as though hovered (the launcher passes its own hover state). */
  hovered?: boolean
  className?: string
}

type Grid = boolean[][]

const blank = (): Grid => Array.from({ length: ROWS }, () => Array(COLS).fill(false))
const lit = (g: Grid, x: number, y: number) => {
  if (x >= 0 && x < COLS && y >= 0 && y < ROWS) g[y][x] = true
}
const fromRows = (rows: string[], g: Grid = blank()) => {
  rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && lit(g, x, y)))
  return g
}

/** The two eyes, open, closed or happy, shifted by where Robi is looking. */
function eyes(g: Grid, kind: 'open' | 'closed' | 'happy' | 'wide', dx: number, dy: number) {
  for (const left of [1, 6]) {
    const x = left + dx
    if (kind === 'open') {
      lit(g, x, 1 + dy); lit(g, x + 1, 1 + dy); lit(g, x, 2 + dy); lit(g, x + 1, 2 + dy)
    } else if (kind === 'wide') {
      for (let y = 1; y <= 3; y++) { lit(g, x, y + dy); lit(g, x + 1, y + dy) }
    } else if (kind === 'closed') {
      lit(g, x, 2 + dy); lit(g, x + 1, 2 + dy)
    } else {
      // ^ ^
      lit(g, x, 2 + dy); lit(g, x + 1, 1 + dy); lit(g, x + 2, 2 + dy)
    }
  }
}

const MOUTHS: Record<string, string[]> = {
  smile: ['', '', '', '', '..#...#..', '...###...'],
  grin: ['', '', '', '', '.#.....#.', '..#####..'],
  flat: ['', '', '', '', '', '...###...'],
  open: ['', '', '', '', '...###...', '...#.#...', '...###...'],
  oh: ['', '', '', '', '....#....', '...#.#...', '....#....'],
  sleepy: ['', '', '', '', '', '....##...'],
}

function faceFor(mood: RobotMood, frame: number, look: { dx: number; dy: number }, blinking: boolean, hovered: boolean): Grid {
  const g = blank()
  const { dx, dy } = look
  switch (mood) {
    case 'happy':
      eyes(g, 'happy', 0, 0)
      fromRows(MOUTHS.grin, g)
      break
    case 'thinking':
      // Eyes up and to the side; the mouth is a little dot loader.
      eyes(g, blinking ? 'closed' : 'open', 1, -1)
      lit(g, 3 + (frame % 3), 5)
      break
    case 'talking':
      eyes(g, blinking ? 'closed' : 'open', dx, dy)
      fromRows(frame % 2 === 0 ? MOUTHS.open : MOUTHS.flat, g)
      break
    case 'alert':
      eyes(g, blinking ? 'closed' : 'wide', 0, 0)
      fromRows(MOUTHS.oh, g)
      break
    case 'sleepy':
      eyes(g, 'closed', 0, 0)
      fromRows(MOUTHS.sleepy, g)
      lit(g, 8, 0)
      break
    default:
      if (hovered) {
        eyes(g, 'happy', 0, 0)
        fromRows(MOUTHS.grin, g)
      } else {
        eyes(g, blinking ? 'closed' : 'open', dx, dy)
        fromRows(MOUTHS.smile, g)
      }
  }
  return g
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function DotFace({ mood = 'idle', size = 40, interactive = false, hovered = false, className }: DotFaceProps) {
  const ref = useRef<SVGSVGElement>(null)
  const [frame, setFrame] = useState(0)
  const [blinking, setBlinking] = useState(false)
  const [look, setLook] = useState({ dx: 0, dy: 0 })
  const [still] = useState(prefersReducedMotion)
  const pointerAt = useRef(0)

  // Mouth frames for talking and thinking.
  useEffect(() => {
    if (still || (mood !== 'talking' && mood !== 'thinking')) return
    const id = window.setInterval(() => setFrame((f) => f + 1), mood === 'thinking' ? 260 : 180)
    return () => window.clearInterval(id)
  }, [mood, still])

  // A blink every few seconds, at an uneven pace.
  useEffect(() => {
    if (still) return
    let timer = 0
    const next = () => {
      timer = window.setTimeout(() => {
        setBlinking(true)
        window.setTimeout(() => setBlinking(false), 130)
        next()
      }, 2600 + Math.random() * 3200)
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
      pointerAt.current = Date.now()
      const x = e.clientX - (box.left + box.width / 2)
      const y = e.clientY - (box.top + box.height / 2)
      const dx = Math.abs(x) < 40 ? 0 : x > 0 ? 1 : -1
      const dy = y < -60 ? -1 : y > 60 ? 1 : 0
      setLook((cur) => (cur.dx === dx && cur.dy === dy ? cur : { dx, dy }))
    }
    const wander = window.setInterval(() => {
      if (Date.now() - pointerAt.current < 4000) return
      const options = [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 0 }]
      setLook(options[Math.floor(Math.random() * options.length)])
    }, 3500)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.clearInterval(wander)
    }
  }, [interactive, still])

  const grid = faceFor(mood, frame, look, blinking, interactive && hovered)
  // Pink cheeks when Robi is pleased.
  const blush = mood === 'happy' || (mood === 'idle' && interactive && hovered)
  const isCheek = (x: number, y: number) => blush && y === 3 && (x === 0 || x === 8)
  const pitch = 10
  const r = 4

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${COLS * pitch + 8} ${ROWS * pitch + 8}`}
      width={size}
      height={size * ((ROWS * pitch + 8) / (COLS * pitch + 8))}
      aria-hidden="true"
      className={cn('robi-dots', className)}
      data-mood={mood}
    >
      {grid.map((row, y) =>
        row.map((on, x) => (
          <circle
            key={`${x}-${y}`}
            cx={4 + x * pitch + pitch / 2}
            cy={4 + y * pitch + pitch / 2}
            r={r}
            className={isCheek(x, y) ? 'robi-dot robi-dot-blush' : on ? 'robi-dot robi-dot-on' : 'robi-dot'}
          />
        ))
      )}
    </svg>
  )
}

/** The face on its little rounded screen: Robi's body wherever Robi appears. */
export function RobiScreen({
  mood,
  size = 40,
  interactive,
  hovered,
  className,
}: DotFaceProps) {
  return (
    <div
      className={cn('robi-screen flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size, borderRadius: size * 0.32, padding: size * 0.09 }}
    >
      <DotFace mood={mood} size={size * 0.82} interactive={interactive} hovered={hovered} />
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
