/**
 * Shared pieces for the festival drawings (FestivalArt and FestivalScenes):
 * halos, lotuses, faces, lamps, pots, kites, rangoli. Plain SVG, nothing
 * downloaded. Split out on 18 Nov 2026 when every festival got its own scene.
 */

import type { ReactNode } from 'react'

export type Draw = (id: string) => ReactNode

export const ring = (n: number, r: number, cx: number, cy: number, start = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

/** Points along a quadratic curve, for garlands and bead strings. */
export const along = (n: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n
    return [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1] as const
  })

export function Halo({ id, cx, cy, r, inner = '#fff7c2', outer = '#ffb703' }: { id: string; cx: number; cy: number; r: number; inner?: string; outer?: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}halo`}>
          <stop offset="0%" stopColor={inner} stopOpacity="0.95" />
          <stop offset="55%" stopColor={outer} stopOpacity="0.4" />
          <stop offset="100%" stopColor={outer} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}halo)`} />
    </>
  )
}

export function Lotus({ cx, base, back = '#f9a8d4', front = '#ec4899', spread = 1, edge = '#f472b6', edgeFront = '#be185d' }: { cx: number; base: number; back?: string; front?: string; spread?: number; edge?: string; edgeFront?: string }) {
  return (
    <g>
      {[-66, -44, -22, 0, 22, 44, 66].map((a) => (
        <ellipse key={`b${a}`} cx={cx} cy={base - 26 * spread} rx={13 * spread} ry={28 * spread} fill={back} stroke={edge} strokeWidth="0.8" transform={`rotate(${a} ${cx} ${base})`} />
      ))}
      {[-50, -25, 0, 25, 50].map((a) => (
        <ellipse key={`f${a}`} cx={cx} cy={base - 18 * spread} rx={11 * spread} ry={20 * spread} fill={front} stroke={edgeFront} strokeWidth="0.6" transform={`rotate(${a} ${cx} ${base})`} />
      ))}
    </g>
  )
}

/** Small lotus flower held in a hand. */
export function HandLotus({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[-50, -25, 0, 25, 50].map((a) => (
        <ellipse key={a} cx="0" cy="-7" rx="3.6" ry="8" fill={a === 0 ? '#ec4899' : '#f9a8d4'} stroke="#db2777" strokeWidth="0.5" transform={`rotate(${a} 0 0)`} />
      ))}
      <circle cx="0" cy="-1" r="2.2" fill="#facc15" />
      <path d="M0 0 L0 14" stroke="#16a34a" strokeWidth="1.6" />
    </g>
  )
}

/** A gold gradient for crowns and pots, referenced as url(#<id>gold). */
export function GoldDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffe9a3" />
        <stop offset="100%" stopColor="#d99a06" />
      </linearGradient>
    </defs>
  )
}

/**
 * A face, 20 units in radius at scale 1. `look` sets the hair: long hair for a
 * woman, short for a man or a child, none for a covered or bald head.
 */
export function Face({
  x,
  y,
  r = 20,
  skin,
  hair = '#1f2937',
  look = 'woman',
  closed = false,
  mark = 'none',
  beard,
  moustache,
  lips = '#be123c',
  earrings = look === 'woman',
  back = true,
}: {
  x: number
  y: number
  r?: number
  skin: string
  hair?: string
  look?: 'woman' | 'man' | 'child' | 'none'
  closed?: boolean
  mark?: 'bindi' | 'tilak' | 'tripundra' | 'none'
  beard?: string
  moustache?: string
  lips?: string
  earrings?: boolean
  /** Long hair behind the head; off when the hair is drawn behind the body instead. */
  back?: boolean
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${r / 20})`}>
      {look === 'woman' && back && <path d="M-22 -4 Q-25 24 -19 34 L19 34 Q25 24 22 -4 Z" fill={hair} />}
      <ellipse cx="0" cy="0" rx="18" ry="20" fill={skin} />
      {look !== 'none' && <path d="M-18.6 1 Q-19.5 -23.5 0 -23.5 Q19.5 -23.5 18.6 1 Q13 -13 0 -13 Q-13 -13 -18.6 1 Z" fill={hair} />}
      <path d="M-11 -6 q4.5 -2.6 9 0 M2 -6 q4.5 -2.6 9 0" stroke="#3f2a1d" strokeWidth="1.1" fill="none" />
      {closed ? (
        <path d="M-11 1 q4.5 3.4 9 0 M2 1 q4.5 3.4 9 0" stroke="#1f2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <path d="M-11 1 q4.5 -3.8 9 0 q-4.5 2.8 -9 0 Z M2 1 q4.5 -3.8 9 0 q-4.5 2.8 -9 0 Z" fill="#1f2937" />
          <circle cx="-5.4" cy="-0.2" r="0.9" fill="#ffffff" />
          <circle cx="7.6" cy="-0.2" r="0.9" fill="#ffffff" />
        </>
      )}
      <path d="M-1.6 6 q1.6 2.6 3.2 0" stroke="rgba(0,0,0,0.28)" strokeWidth="1" fill="none" />
      <path d="M-5 11 q5 4.4 10 0" stroke={lips} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <ellipse cx="-10.5" cy="7" rx="3.6" ry="2.4" fill="#fda4af" opacity="0.55" />
      <ellipse cx="10.5" cy="7" rx="3.6" ry="2.4" fill="#fda4af" opacity="0.55" />
      {mark === 'bindi' && <circle cx="0" cy="-9" r="1.7" fill="#dc2626" />}
      {mark === 'tilak' && (
        <>
          <path d="M-3 -17 q3 9 6 0" stroke="#fde68a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M0 -15 v7" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {mark === 'tripundra' && (
        <>
          <path d="M-9 -16 H9 M-9 -13 H9 M-9 -10 H9" stroke="#f8fafc" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="0" cy="-13" r="1.5" fill="#dc2626" />
        </>
      )}
      {beard && <path d="M-17 4 Q-16 32 0 40 Q16 32 17 4 Q11 17 0 17 Q-11 17 -17 4 Z" fill={beard} />}
      {(moustache ?? beard) && <path d="M-9 9.5 Q-4 6 0 8.5 Q4 6 9 9.5 Q4 11.5 0 10 Q-4 11.5 -9 9.5 Z" fill={moustache ?? beard} />}
      {earrings && (
        <>
          <circle cx="-18.5" cy="6" r="2.4" fill="#fbbf24" />
          <circle cx="18.5" cy="6" r="2.4" fill="#fbbf24" />
        </>
      )}
    </g>
  )
}

/** A clay lamp with its flame; y is the bottom of the bowl. */
export function Diya({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-13 -6 Q0 6 13 -6 Q16 -8 18 -10 Q8 -10 0 -9 Q-8 -9 -13 -6 Z" fill="#c2410c" />
      <path d="M-13 -6 Q0 6 13 -6" stroke="#fbbf24" strokeWidth="1" fill="none" />
      <path d="M-6 -3 h3 M-1 -2 h3 M4 -3 h3" stroke="#fde68a" strokeWidth="0.9" />
      <path d="M15 -10 C11 -15 13 -21 15 -25 C17 -21 19 -15 15 -10 Z" fill="#f59e0b" />
      <path d="M15 -11 C13.4 -14 14 -17 15 -19 C16 -17 16.6 -14 15 -11 Z" fill="#fef9c3" />
    </g>
  )
}

/** A kalash with mango leaves and a coconut; y is the bottom of the pot. */
export function Kalash({ x, y, s = 1, body = '#d97706', rim = '#f59e0b' }: { x: number; y: number; s?: number; body?: string; rim?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[-64, -32, 0, 32, 64].map((a) => (
        <ellipse key={a} cx="0" cy="-43" rx="3.6" ry="10" fill={a === 0 ? '#15803d' : '#16a34a'} transform={`rotate(${a} 0 -33)`} />
      ))}
      <path d="M-14 0 Q-23 -14 -12 -26 L12 -26 Q23 -14 14 0 Z" fill={body} stroke="#92400e" strokeWidth="1" />
      <rect x="-8" y="-32" width="16" height="7" rx="2" fill="#b45309" />
      <ellipse cx="0" cy="-32" rx="11" ry="3" fill={rim} />
      <path d="M-4 -15 h8 M0 -19 v8 M-4 -15 v-4 M4 -15 v4 M0 -19 h4 M0 -11 h-4" stroke="#dc2626" strokeWidth="1.3" />
      <path d="M-11 -28 Q0 -24 11 -28" stroke="#dc2626" strokeWidth="1.4" fill="none" />
      <circle cx="0" cy="-41" r="7" fill="#92400e" />
      <path d="M0 -48 l-3 -5 M0 -48 l3 -5 M0 -48 v-5" stroke="#a16207" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  )
}

/** A four-pointed sparkle. */
export function Sparkle({ x, y, r = 4, fill = '#fde047' }: { x: number; y: number; r?: number; fill?: string }) {
  const q = r / 4
  return <path d={`M${x} ${y - r} L${x + q} ${y - q} L${x + r} ${y} L${x + q} ${y + q} L${x} ${y + r} L${x - q} ${y + q} L${x - r} ${y} L${x - q} ${y - q} Z`} fill={fill} />
}

/** A marigold garland along a curve. */
export function Marigolds({ x0, y0, cx, cy, x1, y1, n = 11, r = 4 }: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; n?: number; r?: number }) {
  return (
    <g>
      <path d={`M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`} stroke="#15803d" strokeWidth="1.2" fill="none" />
      {along(n, x0, y0, cx, cy, x1, y1).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? '#facc15' : '#f97316'} />
      ))}
    </g>
  )
}

/** A string of mango leaves, as hung over a doorway. */
export function Toran({ x0, x1, y, sag = 8 }: { x0: number; x1: number; y: number; sag?: number }) {
  const cx = (x0 + x1) / 2
  const n = Math.max(6, Math.round((x1 - x0) / 13))
  return (
    <g>
      <path d={`M${x0} ${y} Q${cx} ${y + sag * 2} ${x1} ${y}`} stroke="#b45309" strokeWidth="1.6" fill="none" />
      {along(n, x0, y, cx, y + sag * 2, x1, y).map(([x, yy], i) => (
        <g key={i}>
          <path d={`M${x} ${yy} q-5 10 0 20 q5 -10 0 -20 Z`} fill={i % 2 ? '#16a34a' : '#15803d'} />
          {i % 2 === 0 && <circle cx={x + 6.5} cy={yy + 3} r="3" fill="#f97316" />}
        </g>
      ))}
    </g>
  )
}

/** The sun with soft rays. */
export function Sun({ cx, cy, r, color = '#fbbf24', ray = '#fcd34d' }: { cx: number; cy: number; r: number; color?: string; ray?: string }) {
  return (
    <g>
      {ring(12, r * 1.45, cx, cy).map(([x, y], i) => (
        <path key={i} d={`M${cx + (x - cx) * 0.78} ${cy + (y - cy) * 0.78} L${x} ${y}`} stroke={ray} strokeWidth={r * 0.14} strokeLinecap="round" />
      ))}
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="#fff7cc" opacity="0.5" />
    </g>
  )
}

/** A gold crown; y is the top of its band. Needs GoldDefs with the same id. */
export function Crown({ id, cx, y, w = 38 }: { id: string; cx: number; y: number; w?: number }) {
  const h = w * 0.9
  return (
    <g>
      <path d={`M${cx - w / 2 + 1} ${y + 4} Q${cx - w / 2 + 3} ${y - h * 0.6} ${cx} ${y - h} Q${cx + w / 2 - 3} ${y - h * 0.6} ${cx + w / 2 - 1} ${y + 4} Z`} fill={`url(#${id}gold)`} stroke="#b45309" strokeWidth="0.8" />
      <rect x={cx - w / 2} y={y} width={w} height={w * 0.16} rx="2" fill="#d97706" />
      {[-0.36, -0.18, 0, 0.18, 0.36].map((t) => (
        <circle key={t} cx={cx + t * w} cy={y + w * 0.08} r={w * 0.035} fill="#fff7cc" />
      ))}
      <circle cx={cx} cy={y - h * 0.45} r={w * 0.12} fill="#dc2626" stroke="#fff7cc" strokeWidth="1" />
      <circle cx={cx - w * 0.24} cy={y - h * 0.2} r={w * 0.06} fill="#16a34a" />
      <circle cx={cx + w * 0.24} cy={y - h * 0.2} r={w * 0.06} fill="#16a34a" />
      <circle cx={cx} cy={y - h} r={w * 0.08} fill="#fbbf24" />
    </g>
  )
}

/** India's flag with the Ashoka Chakra; x, y is the top corner at the pole. */
export function Tiranga({ x, y, w = 60 }: { x: number; y: number; w?: number }) {
  const h = (w * 2) / 3
  const b = h / 3
  const wave = (top: number) => `M${x} ${top} Q${x + w * 0.25} ${top - 3} ${x + w * 0.5} ${top} T${x + w} ${top}`
  const band = (top: number, fill: string) => (
    <path d={`${wave(top)} V${top + b} Q${x + w * 0.75} ${top + b + 3} ${x + w * 0.5} ${top + b} T${x} ${top + b} Z`} fill={fill} />
  )
  const cx = x + w / 2
  const cy = y + h / 2
  const r = b * 0.42
  return (
    <g>
      {band(y, '#ff9933')}
      {band(y + b, '#ffffff')}
      {band(y + 2 * b, '#138808')}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#000080" strokeWidth={r * 0.14} />
      {ring(24, r, cx, cy).map(([px, py], i) => (
        <path key={i} d={`M${cx} ${cy} L${px} ${py}`} stroke="#000080" strokeWidth={r * 0.06} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.18} fill="#000080" />
      <path d={`M${x} ${y} V${y + h}`} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
    </g>
  )
}

/** A kite with a short tail. */
export function Kite({ x, y, s = 1, a = '#ef4444', b = '#facc15', rot = 0 }: { x: number; y: number; s?: number; a?: string; b?: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 -16 L13 0 L0 18 L-13 0 Z" fill={a} />
      <path d="M0 -16 L13 0 L0 0 Z" fill={b} />
      <path d="M-13 0 L0 18 L0 0 Z" fill={b} opacity="0.55" />
      <path d="M0 -16 V18 M-13 0 Q0 -6 13 0" stroke="#78350f" strokeWidth="0.8" fill="none" />
      <path d="M0 18 l-5 7 h10 Z" fill={b} />
    </g>
  )
}

/** A round rangoli seen on the floor (squashed to lie flat). */
export function Rangoli({ cx, cy, r = 30, squash = 0.4, colors = ['#f472b6', '#facc15', '#22c55e', '#f97316', '#a855f7'] }: { cx: number; cy: number; r?: number; squash?: number; colors?: string[] }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(1 ${squash})`}>
      <circle r={r} fill={colors[0]} />
      {ring(12, r * 0.74, 0, 0).map(([x, y], i) => (
        <ellipse key={`p${i}`} cx={x} cy={y} rx={r * 0.16} ry={r * 0.26} fill={colors[1]} transform={`rotate(${i * 30 + 90} ${x} ${y})`} />
      ))}
      <circle r={r * 0.56} fill={colors[2]} />
      {ring(8, r * 0.36, 0, 0).map(([x, y], i) => (
        <ellipse key={`q${i}`} cx={x} cy={y} rx={r * 0.1} ry={r * 0.17} fill={colors[3]} transform={`rotate(${i * 45 + 90} ${x} ${y})`} />
      ))}
      <circle r={r * 0.2} fill={colors[4]} />
      {ring(20, r * 0.93, 0, 0).map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r={r * 0.04} fill="#ffffff" />
      ))}
    </g>
  )
}

/** A peacock feather; x, y is the eye. */
export function PeacockFeather({ x, y, rot = 22, s = 1 }: { x: number; y: number; rot?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 14 V34" stroke="#65a30d" strokeWidth="2" />
      <ellipse cx="0" cy="0" rx="11" ry="15" fill="#16a34a" />
      <ellipse cx="0" cy="-1" rx="7" ry="10" fill="#fbbf24" />
      <ellipse cx="0" cy="-1.5" rx="5" ry="7" fill="#0d9488" />
      <ellipse cx="0" cy="-2" rx="2.8" ry="4" fill="#1e3a8a" />
    </g>
  )
}
