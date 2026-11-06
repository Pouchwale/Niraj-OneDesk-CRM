/**
 * The deity or characters at the heart of a festival's celebration (6 Nov
 * 2026, at the user's request): Goddess Lakshmi for Diwali, Bal Krishna for
 * Janmashtami, Lord Shiva for Maha Shivratri, Bal Ganesha for Ganesh
 * Chaturthi, and a sister tying a rakhi on her brother's wrist for Raksha
 * Bandhan. Drawn here as plain SVG in a gentle, devotional style; nothing is
 * downloaded.
 */

import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Draw = (id: string) => ReactNode

const ring = (n: number, r: number, cx: number, cy: number, start = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

/** Points along a quadratic curve, for garlands and bead strings. */
const along = (n: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n
    return [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1] as const
  })

function Halo({ id, cx, cy, r, inner = '#fff7c2', outer = '#ffb703' }: { id: string; cx: number; cy: number; r: number; inner?: string; outer?: string }) {
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

function Lotus({ cx, base, back = '#f9a8d4', front = '#ec4899', spread = 1 }: { cx: number; base: number; back?: string; front?: string; spread?: number }) {
  return (
    <g>
      {[-66, -44, -22, 0, 22, 44, 66].map((a) => (
        <ellipse key={`b${a}`} cx={cx} cy={base - 26 * spread} rx={13 * spread} ry={28 * spread} fill={back} stroke="#f472b6" strokeWidth="0.8" transform={`rotate(${a} ${cx} ${base})`} />
      ))}
      {[-50, -25, 0, 25, 50].map((a) => (
        <ellipse key={`f${a}`} cx={cx} cy={base - 18 * spread} rx={11 * spread} ry={20 * spread} fill={front} stroke="#be185d" strokeWidth="0.6" transform={`rotate(${a} ${cx} ${base})`} />
      ))}
    </g>
  )
}

/** Small lotus flower held in a hand. */
function HandLotus({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
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

/* ===================== Goddess Lakshmi (Diwali) ===================== */

const lakshmi: Draw = (id) => {
  const skin = '#f7c9a1'
  return (
    <>
      <defs>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9a3" />
          <stop offset="100%" stopColor="#d99a06" />
        </linearGradient>
      </defs>
      <Halo id={id} cx={100} cy={70} r={62} />
      <circle cx="100" cy="70" r="46" fill="none" stroke="#fcd34d" strokeWidth="2" strokeDasharray="2 5" opacity="0.9" />
      <Lotus cx={100} base={222} spread={1.25} />
      {/* Hair falling behind the shoulders */}
      <path d="M80 70 Q76 104 72 118 L90 116 Q86 96 88 74 Z" fill="#1f2937" />
      <path d="M120 70 Q124 104 128 118 L110 116 Q114 96 112 74 Z" fill="#1f2937" />
      {/* Saree and lap */}
      <path d="M72 128 Q100 120 128 128 L162 196 Q100 214 38 196 Z" fill="#dc2626" />
      <path d="M38 196 Q100 214 162 196" stroke="#f59e0b" strokeWidth="5" fill="none" />
      <path d="M44 186 Q100 202 156 186" stroke="#fbbf24" strokeWidth="1.4" fill="none" strokeDasharray="3 3" />
      {[84, 96, 108, 120].map((x) => (
        <path key={x} d={`M${x} 134 Q${x - 2} 168 ${x - 6} 202`} stroke="#b91c1c" strokeWidth="1.2" fill="none" />
      ))}
      {/* Upper arms with lotuses */}
      <path d="M84 104 Q66 98 60 80" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M116 104 Q134 98 140 80" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M58 86 L64 84" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M142 86 L136 84" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <HandLotus x={58} y={74} s={1.25} />
      <HandLotus x={142} y={74} s={1.25} />
      {/* Blouse and pallu */}
      <path d="M82 100 Q100 94 118 100 L117 130 Q100 136 83 130 Z" fill="#15803d" />
      <path d="M112 100 Q128 128 116 162 L104 160 Q116 130 104 104 Z" fill="#ef4444" stroke="#f59e0b" strokeWidth="1.6" />
      {/* Lower arms: blessing with gold coins, and the kalash */}
      <path d="M86 116 Q72 128 66 142" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <ellipse cx="64" cy="148" rx="7" ry="9" fill={skin} />
      <path d="M58 138 L70 138" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      {[
        [62, 164],
        [68, 175],
        [59, 186],
        [69, 197],
        [61, 208],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4.6" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
          <circle cx={x - 1.2} cy={y - 1.2} r="1.3" fill="#fff7cc" />
        </g>
      ))}
      <path d="M114 116 Q128 128 132 140" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M128 138 L138 138" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <g>
        <path d="M128 136 Q126 130 132 128 L144 128 Q150 130 148 136 Z" fill={`url(#${id}gold)`} />
        <circle cx="138" cy="150" r="12" fill={`url(#${id}gold)`} stroke="#b45309" strokeWidth="1" />
        <path d="M127 150 H149" stroke="#b45309" strokeWidth="1.2" />
        <ellipse cx="133" cy="124" rx="3" ry="7" fill="#16a34a" transform="rotate(-30 133 124)" />
        <ellipse cx="143" cy="124" rx="3" ry="7" fill="#16a34a" transform="rotate(30 143 124)" />
        <circle cx="138" cy="121" r="4.5" fill="#a16207" />
      </g>
      {/* Neck and necklaces */}
      <rect x="95" y="88" width="10" height="12" fill={skin} />
      <path d="M86 99 Q100 114 114 99" stroke="#fbbf24" strokeWidth="3" fill="none" />
      <path d="M84 101 Q100 124 116 101" stroke="#f59e0b" strokeWidth="2.4" fill="none" />
      <circle cx="100" cy="116" r="3.2" fill="#dc2626" stroke="#fbbf24" strokeWidth="1" />
      {/* Face */}
      <ellipse cx="100" cy="72" rx="23" ry="25" fill="#1f2937" />
      <ellipse cx="100" cy="75" rx="17" ry="20" fill={skin} />
      <path d="M83 74 Q84 54 100 54 Q116 54 117 74 Q110 61 100 61 Q90 61 83 74 Z" fill="#1f2937" />
      <path d="M100 55 V61" stroke="#dc2626" strokeWidth="1.6" />
      <path d="M88 70 q4 -2.4 8 0" stroke="#3f2a1d" strokeWidth="1.1" fill="none" />
      <path d="M104 70 q4 -2.4 8 0" stroke="#3f2a1d" strokeWidth="1.1" fill="none" />
      <path d="M88 76 q4 -3.4 8 0 q-4 2.6 -8 0 Z" fill="#1f2937" />
      <path d="M104 76 q4 -3.4 8 0 q-4 2.6 -8 0 Z" fill="#1f2937" />
      <circle cx="100" cy="65" r="1.8" fill="#dc2626" />
      <path d="M98 79 q2 3 4 0" stroke="#d29b77" strokeWidth="1" fill="none" />
      <circle cx="104.5" cy="81" r="1.8" fill="none" stroke="#f59e0b" strokeWidth="0.9" />
      <path d="M96 86 q4 3 8 0" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="89" cy="82" r="2.4" fill="#fda4af" opacity="0.5" />
      <circle cx="111" cy="82" r="2.4" fill="#fda4af" opacity="0.5" />
      <circle cx="83" cy="84" r="2.6" fill="#fbbf24" />
      <path d="M80.5 86 h5 l-1 4 h-3 Z" fill="#f59e0b" />
      <circle cx="117" cy="84" r="2.6" fill="#fbbf24" />
      <path d="M114.5 86 h5 l-1 4 h-3 Z" fill="#f59e0b" />
      {/* Crown */}
      <path d="M82 57 Q84 34 100 20 Q116 34 118 57 Z" fill={`url(#${id}gold)`} stroke="#b45309" strokeWidth="0.8" />
      <rect x="81" y="53" width="38" height="6" rx="2" fill="#d97706" />
      {[86, 93, 100, 107, 114].map((x) => (
        <circle key={x} cx={x} cy="56" r="1.3" fill="#fff7cc" />
      ))}
      <circle cx="100" cy="40" r="4.6" fill="#dc2626" stroke="#fff7cc" strokeWidth="1" />
      <circle cx="91" cy="48" r="2.4" fill="#16a34a" />
      <circle cx="109" cy="48" r="2.4" fill="#16a34a" />
      <circle cx="100" cy="19" r="3" fill="#fbbf24" />
    </>
  )
}

/* ===================== Bal Krishna (Janmashtami) ===================== */

const krishna: Draw = (id) => {
  const skin = '#6fa8f2'
  const shade = '#4f8ee6'
  return (
    <>
      <Halo id={id} cx={100} cy={92} r={74} inner="#fffbe6" outer="#facc15" />
      <ellipse cx="100" cy="206" rx="62" ry="8" fill="rgba(0,0,0,0.18)" />
      {/* Peacock feather rising from the topknot */}
      <path d="M102 50 Q110 30 118 10" stroke="#65a30d" strokeWidth="2.4" fill="none" />
      {[16, 22, 28, 34, 40].map((y, i) => (
        <path key={y} d={`M${110 + i * -1.5} ${y + 6} l-7 -3 M${112 + i * -1.5} ${y + 4} l7 -5`} stroke="#4d7c0f" strokeWidth="1" />
      ))}
      <g transform="rotate(22 120 16)">
        <ellipse cx="120" cy="16" rx="11" ry="15" fill="#16a34a" />
        <ellipse cx="120" cy="15" rx="7" ry="10" fill="#fbbf24" />
        <ellipse cx="120" cy="14.5" rx="5" ry="7" fill="#0d9488" />
        <ellipse cx="120" cy="14" rx="2.8" ry="4" fill="#1e3a8a" />
      </g>
      {/* Seated legs in a yellow dhoti */}
      <ellipse cx="100" cy="186" rx="58" ry="19" fill="#facc15" />
      <path d="M50 182 Q100 198 150 182" stroke="#eab308" strokeWidth="2" fill="none" />
      <ellipse cx="70" cy="196" rx="11" ry="6" fill={skin} />
      <ellipse cx="130" cy="196" rx="11" ry="6" fill={skin} />
      <path d="M62 196 h4 M134 196 h4" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
      {/* Body */}
      <ellipse cx="100" cy="146" rx="34" ry="31" fill={skin} />
      <ellipse cx="100" cy="156" rx="22" ry="18" fill="#8dbbf6" opacity="0.7" />
      <path d="M64 170 Q100 184 136 170" stroke="#ef4444" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Vaijayanti garland and pearls */}
      <path d="M76 118 Q100 196 124 118" stroke="#22c55e" strokeWidth="3.4" fill="none" />
      {along(9, 76, 118, 100, 196, 124, 118).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 2.6 : 3.2} fill={i % 2 ? '#fde047' : '#ef4444'} />
      ))}
      {along(9, 82, 118, 100, 136, 118, 118).map(([x, y], i) => (
        <circle key={`p${i}`} cx={x} cy={y} r="1.8" fill="#fffaf0" />
      ))}
      {/* Flute at the side */}
      <path d="M136 176 L170 158" stroke="#92400e" strokeWidth="4.2" strokeLinecap="round" />
      {[0.25, 0.5, 0.75].map((t) => (
        <circle key={t} cx={136 + 34 * t} cy={176 - 18 * t} r="1" fill="#fde68a" />
      ))}
      {/* The butter pot in his lap */}
      <ellipse cx="100" cy="176" rx="24" ry="17" fill="#b45309" />
      <ellipse cx="96" cy="171" rx="8" ry="5" fill="#d97706" opacity="0.6" />
      {along(9, 78, 180, 100, 190, 122, 180).map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r="1.4" fill="#fde68a" />
      ))}
      <ellipse cx="100" cy="161" rx="15" ry="5" fill="#92400e" />
      <path d="M86 161 Q88 148 100 150 Q112 146 114 161 Z" fill="#fffbeb" />
      <path d="M108 161 q2 6 0 9" stroke="#fffbeb" strokeWidth="3" strokeLinecap="round" />
      {/* Arms: one round the pot, one with butter at his mouth */}
      <path d="M70 128 Q64 158 80 170" stroke={skin} strokeWidth="12" strokeLinecap="round" fill="none" />
      <ellipse cx="82" cy="170" rx="8" ry="6" fill={skin} />
      <path d="M74 162 l7 5" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M130 128 Q146 116 126 104" stroke={skin} strokeWidth="12" strokeLinecap="round" fill="none" />
      <path d="M135 116 l-6 5" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="123" cy="103" rx="8" ry="7" fill={skin} />
      <circle cx="121" cy="96" r="5" fill="#fffbeb" />
      {/* Head */}
      <circle cx="100" cy="86" r="33" fill="#1f2937" />
      <circle cx="100" cy="90" r="29" fill={skin} />
      <path d="M72 84 Q78 60 100 60 Q122 60 128 84 Q116 70 100 70 Q84 70 72 84 Z" fill="#1f2937" />
      <circle cx="72" cy="94" r="6" fill="#1f2937" />
      <circle cx="128" cy="94" r="6" fill="#1f2937" />
      <circle cx="100" cy="54" r="10" fill="#1f2937" />
      <rect x="89" y="59" width="22" height="5" rx="2.5" fill="#fbbf24" />
      {[93, 100, 107].map((x) => (
        <circle key={x} cx={x} cy="61.5" r="1.2" fill="#fffaf0" />
      ))}
      <path d="M95 70 q5 12 10 0" stroke="#fde68a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M100 70 v8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="90" cy="91" rx="4" ry="5" fill="#111827" />
      <ellipse cx="110" cy="91" rx="4" ry="5" fill="#111827" />
      <circle cx="91.6" cy="89.2" r="1.5" fill="#ffffff" />
      <circle cx="111.6" cy="89.2" r="1.5" fill="#ffffff" />
      <path d="M85 84 q5 -3 10 0 M105 84 q5 -3 10 0" stroke="#1f2937" strokeWidth="1.2" fill="none" />
      <path d="M94 101 q6 6 12 0" stroke="#1e3a8a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="82" cy="99" rx="5" ry="3.4" fill="#f9a8d4" opacity="0.7" />
      <ellipse cx="118" cy="99" rx="5" ry="3.4" fill="#f9a8d4" opacity="0.7" />
      <circle cx="113" cy="104" r="2.2" fill="#fffbeb" />
      <circle cx="71" cy="101" r="3.6" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      <circle cx="129" cy="101" r="3.6" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      <rect x="93" y="117" width="14" height="6" fill={shade} opacity="0.5" />
    </>
  )
}

/* ===================== Lord Shiva (Maha Shivratri) ===================== */

const shiva: Draw = (id) => {
  const skin = '#9cc3f5'
  return (
    <>
      <Halo id={id} cx={100} cy={96} r={84} inner="#ffffff" outer="#93c5fd" />
      {/* Trishul with the damru */}
      <path d="M164 44 V222" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
      <path d="M150 42 H178" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" />
      <path d="M152 42 Q150 24 156 14" stroke="#e2e8f0" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M176 42 Q178 24 172 14" stroke="#e2e8f0" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M164 42 V10" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
      <path d="M159 12 L164 0 L169 12 Z" fill="#f1f5f9" />
      <path d="M151 16 L155 6 L160 15 Z" fill="#f1f5f9" />
      <path d="M177 16 L173 6 L168 15 Z" fill="#f1f5f9" />
      <path d="M154 56 H174 L164 66 Z" fill="#b45309" />
      <path d="M154 76 H174 L164 66 Z" fill="#b45309" />
      <path d="M154 56 H174 M154 76 H174" stroke="#78350f" strokeWidth="1.4" />
      <path d="M166 48 l10 4 l-8 4 Z" fill="#dc2626" />
      {/* Seated in meditation on a tiger skin */}
      <ellipse cx="100" cy="192" rx="64" ry="22" fill="#f59e0b" />
      <ellipse cx="100" cy="188" rx="50" ry="13" fill="#fbbf24" opacity="0.5" />
      {/* Tiger stripes: thin tapered marks across the skin */}
      {[44, 56, 68, 84, 100, 116, 132, 144, 156].map((x, i) => {
        const y = 192 + 15 * Math.sqrt(Math.max(0, 1 - ((x - 100) / 64) ** 2)) - (i % 2 ? 2 : 6)
        return <path key={x} d={`M${x} ${y - 7} q3 7 0 14 q-1.4 -7 0 -14 Z`} fill="#1f2937" transform={`rotate(${(x - 100) / 4} ${x} ${y})`} />
      })}
      <ellipse cx="78" cy="184" rx="11" ry="6" fill={skin} />
      <ellipse cx="122" cy="184" rx="11" ry="6" fill={skin} />
      {/* Hair falling behind the shoulders */}
      <path d="M78 92 Q72 118 64 136 L78 136 Q84 116 86 100 Z" fill="#2d1b12" />
      <path d="M122 92 Q128 118 136 136 L122 136 Q116 116 114 100 Z" fill="#2d1b12" />
      {/* Body */}
      <path d="M62 130 Q100 112 138 130 L130 178 Q100 186 70 178 Z" fill={skin} />
      <path d="M84 146 q16 6 32 0" stroke="#7fa9e6" strokeWidth="1.4" fill="none" />
      <path d="M66 134 Q50 158 54 182" stroke={skin} strokeWidth="12" strokeLinecap="round" fill="none" />
      <path d="M134 134 Q150 158 146 182" stroke={skin} strokeWidth="12" strokeLinecap="round" fill="none" />
      <circle cx="56" cy="184" r="7" fill={skin} />
      <circle cx="144" cy="184" r="7" fill={skin} />
      <circle cx="55" cy="181" r="2.4" fill="none" stroke="#5b8bd6" strokeWidth="1" />
      <circle cx="145" cy="181" r="2.4" fill="none" stroke="#5b8bd6" strokeWidth="1" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={`l${i}`} cx={54 + i * 2.6} cy={146 - i * 1.6} r="1.6" fill="#7c2d12" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={`r${i}`} cx={146 - i * 2.6} cy={146 - i * 1.6} r="1.6" fill="#7c2d12" />
      ))}
      {/* Rudraksha mala */}
      {along(13, 80, 126, 100, 176, 120, 126).map(([x, y], i) => (
        <circle key={`m${i}`} cx={x} cy={y} r="2.4" fill="#7c2d12" stroke="#a16207" strokeWidth="0.5" />
      ))}
      {/* Neck (Neelkanth) and the snake */}
      <rect x="92" y="110" width="16" height="16" fill="#6f9bdc" />
      <path d="M76 122 Q100 140 124 122" stroke="#16a34a" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M124 122 Q134 112 129 100" stroke="#16a34a" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M121 94 Q129 80 137 94 Q135 103 129 105 Q123 103 121 94 Z" fill="#16a34a" />
      <path d="M125 95 Q129 88 133 95 Q131 100 129 100 Q127 100 125 95 Z" fill="#86efac" />
      <circle cx="126.5" cy="92" r="1" fill="#111827" />
      <circle cx="131.5" cy="92" r="1" fill="#111827" />
      {/* Face */}
      <ellipse cx="100" cy="92" rx="22" ry="25" fill={skin} />
      <path d="M86 92 q5 4 10 0 M104 92 q5 4 10 0" stroke="#1e3a8a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M95 105 q5 3 10 0" stroke="#1e3a8a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {[75, 79, 83].map((y) => (
        <path key={y} d={`M87 ${y} H113`} stroke="#f8fafc" strokeWidth="1.8" strokeLinecap="round" />
      ))}
      <path d="M100 66 q3 4 0 8 q-3 -4 0 -8 Z" fill="#dc2626" />
      <circle cx="78" cy="100" r="4.5" fill="none" stroke="#f59e0b" strokeWidth="2" />
      <circle cx="122" cy="100" r="4.5" fill="none" stroke="#f59e0b" strokeWidth="2" />
      {/* Jata, the crescent moon and the Ganga */}
      <path d="M78 78 Q74 46 90 30 Q100 18 110 30 Q126 46 122 78 Q112 68 100 68 Q88 68 78 78 Z" fill="#3b2416" />
      <path d="M84 52 Q100 46 116 52 M82 64 Q100 58 118 64" stroke="#a16207" strokeWidth="2.2" fill="none" strokeDasharray="1 3" strokeLinecap="round" />
      <defs>
        <mask id={`${id}moon`}>
          <rect x="70" y="20" width="40" height="40" fill="white" />
          <circle cx="91.5" cy="33.5" r="8" fill="black" />
        </mask>
      </defs>
      <circle cx="86" cy="38" r="9.5" fill="#fef3c7" mask={`url(#${id}moon)`} />
      <path d="M106 24 q6 -8 2 -16 q-2 -4 2 -8" stroke="#7dd3fc" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="113" cy="12" r="1.6" fill="#bae6fd" />
      <circle cx="104" cy="8" r="1.3" fill="#bae6fd" />
    </>
  )
}

/* ===================== Bal Ganesha (Ganesh Chaturthi) ===================== */

const ganesha: Draw = (id) => {
  const skin = '#ffcfa8'
  const line = '#e89a6c'
  return (
    <>
      <defs>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9a3" />
          <stop offset="100%" stopColor="#d99a06" />
        </linearGradient>
      </defs>
      <Halo id={id} cx={100} cy={84} r={76} />
      <Lotus cx={100} base={222} spread={1.2} />
      {/* Ears */}
      <ellipse cx="59" cy="86" rx="25" ry="29" fill={skin} stroke={line} strokeWidth="1" />
      <ellipse cx="62" cy="88" rx="16" ry="20" fill="#ffb3b8" />
      <ellipse cx="141" cy="86" rx="25" ry="29" fill={skin} stroke={line} strokeWidth="1" />
      <ellipse cx="138" cy="88" rx="16" ry="20" fill="#ffb3b8" />
      {/* Seated in a yellow dhoti */}
      <ellipse cx="100" cy="184" rx="56" ry="18" fill="#fbbf24" />
      <path d="M48 184 Q100 202 152 184" stroke="#dc2626" strokeWidth="3" fill="none" />
      <ellipse cx="74" cy="192" rx="10" ry="6" fill={skin} stroke={line} strokeWidth="0.8" />
      <ellipse cx="126" cy="192" rx="10" ry="6" fill={skin} stroke={line} strokeWidth="0.8" />
      {/* Belly */}
      <ellipse cx="100" cy="148" rx="41" ry="37" fill={skin} stroke={line} strokeWidth="1" />
      <ellipse cx="100" cy="156" rx="27" ry="23" fill="#ffe0c7" />
      <path d="M97 160 q3 3 6 0" stroke={line} strokeWidth="1.4" fill="none" />
      <path d="M76 124 Q106 152 126 178" stroke="#fde68a" strokeWidth="2" fill="none" />
      <path d="M64 170 Q100 182 136 170" stroke="#dc2626" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Stole round the shoulders */}
      <path d="M64 128 Q100 116 136 128" stroke="#ef4444" strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* Arms: blessing, and a modak in hand */}
      <path d="M68 128 Q50 140 51 118" stroke={skin} strokeWidth="12" strokeLinecap="round" fill="none" />
      <ellipse cx="51" cy="106" rx="8.5" ry="11" fill={skin} stroke={line} strokeWidth="0.8" />
      <path d="M45 120 L57 120" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="51" cy="107" r="2.6" fill="#f97316" opacity="0.8" />
      <path d="M132 128 Q152 138 150 156" stroke={skin} strokeWidth="12" strokeLinecap="round" fill="none" />
      <path d="M144 148 L156 148" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="150" cy="160" rx="10" ry="7" fill={skin} stroke={line} strokeWidth="0.8" />
      <path d="M150 132 C159 142 160 152 150 156 C140 152 141 142 150 132 Z" fill="#fff7e6" stroke="#e9c58a" strokeWidth="1" />
      <path d="M150 134 V155 M146 140 Q147 150 148 155 M154 140 Q153 150 152 155" stroke="#e9c58a" strokeWidth="0.8" fill="none" />
      {/* Garland */}
      <path d="M72 114 Q100 142 128 114" stroke="#15803d" strokeWidth="1.4" fill="none" />
      {along(11, 72, 114, 100, 142, 128, 114).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill={i % 2 ? '#facc15' : '#f97316'} />
      ))}
      {/* Head */}
      <circle cx="100" cy="84" r="33" fill={skin} stroke={line} strokeWidth="1" />
      <path d="M100 96 C100 110 92 120 96 130 C100 140 114 140 117 130" stroke={line} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M100 96 C100 110 92 120 96 130 C100 140 114 140 117 130" stroke={skin} strokeWidth="11.5" fill="none" strokeLinecap="round" />
      {[104, 110, 116, 122].map((y) => (
        <path key={y} d={`M${y < 120 ? 94 : 92} ${y} q4 2 8 0`} stroke={line} strokeWidth="1" fill="none" />
      ))}
      <path d="M90 100 q-5 8 -1 14" stroke="#fffaf0" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M110 100 q3 3 1.5 6" stroke="#fffaf0" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M81 83 q6 -6 12 0 M107 83 q6 -6 12 0" stroke="#6b3b1f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="81" cy="93" rx="6" ry="4" fill="#ff9aa2" opacity="0.6" />
      <ellipse cx="119" cy="93" rx="6" ry="4" fill="#ff9aa2" opacity="0.6" />
      <path d="M94 66 q6 11 12 0" stroke="#facc15" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M100 64 v9" stroke="#dc2626" strokeWidth="2.6" strokeLinecap="round" />
      {/* Crown */}
      <path d="M75 56 C77 38 89 26 100 12 C111 26 123 38 125 56 Z" fill={`url(#${id}gold)`} stroke="#b45309" strokeWidth="0.8" />
      <rect x="73" y="52" width="54" height="8" rx="3" fill="#d97706" />
      {[78, 86, 94, 102, 110, 118].map((x) => (
        <circle key={x} cx={x + 2} cy="56" r="1.5" fill="#fff7cc" />
      ))}
      <circle cx="100" cy="38" r="5" fill="#dc2626" stroke="#fff7cc" strokeWidth="1" />
      <circle cx="89" cy="47" r="2.8" fill="#16a34a" />
      <circle cx="111" cy="47" r="2.8" fill="#16a34a" />
      <circle cx="100" cy="11" r="3.4" fill="#fbbf24" />
      {/* Mooshak, his mouse */}
      <g>
        <path d="M150 210 q-12 6 -18 -2" stroke="#a8a29e" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="164" cy="208" rx="14" ry="9" fill="#a8a29e" />
        <circle cx="177" cy="201" r="7.5" fill="#a8a29e" />
        <circle cx="174" cy="194" r="4.2" fill="#d6d3d1" />
        <circle cx="174" cy="194" r="2.4" fill="#fda4af" />
        <circle cx="180" cy="200" r="1.3" fill="#1f2937" />
        <circle cx="184.5" cy="203" r="1.5" fill="#fb7185" />
        <path d="M156 214 l-2 4 M170 214 l2 4" stroke="#78716c" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </>
  )
}

/* ===================== Sister and brother (Raksha Bandhan) ===================== */

const siblings: Draw = (id) => {
  const her = '#f8c8a0'
  const him = '#e9b489'
  return (
    <>
      <Halo id={id} cx={110} cy={100} r={96} inner="#fff1f5" outer="#f9a8d4" />
      {/* Sister */}
      <path d="M44 188 L58 130 L82 130 L96 188 Q70 198 44 188 Z" fill="#ec4899" />
      <path d="M44 188 Q70 198 96 188" stroke="#fbbf24" strokeWidth="4" fill="none" />
      <path d="M50 170 Q70 178 90 170" stroke="#fde68a" strokeWidth="1.4" fill="none" strokeDasharray="2 3" />
      <path d="M54 104 Q70 96 86 104 L84 132 L56 132 Z" fill="#f59e0b" />
      <path d="M86 104 L56 134" stroke="#a855f7" strokeWidth="7" strokeLinecap="round" opacity="0.9" />
      <path d="M56 110 Q42 120 40 132" stroke={her} strokeWidth="8" strokeLinecap="round" fill="none" />
      <ellipse cx="36" cy="138" rx="15" ry="4.6" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
      <path d="M31 135 Q36 131 41 135 Q36 138 31 135 Z" fill="#c2410c" />
      <path d="M36 131 q2 -4 0 -7 q-2 3 0 7 Z" fill="#f59e0b" />
      <circle cx="27" cy="136" r="2" fill="#dc2626" />
      <circle cx="45" cy="136" r="1.2" fill="#fffaf0" />
      <circle cx="47" cy="134.5" r="1" fill="#fffaf0" />
      <path d="M84 110 Q98 118 108 124" stroke={her} strokeWidth="8" strokeLinecap="round" fill="none" />
      <rect x="66" y="88" width="8" height="12" fill={her} />
      <circle cx="70" cy="72" r="24" fill={her} />
      <path d="M46 74 Q46 46 70 46 Q94 46 94 74 Q86 58 70 58 Q54 58 46 74 Z" fill="#1f2937" />
      {[80, 88, 96, 104, 112].map((y, i) => (
        <circle key={y} cx={48 - i * 0.8} cy={y} r={5 - i * 0.4} fill="#1f2937" />
      ))}
      <circle cx="47" cy="117" r="2.4" fill="#ef4444" />
      <circle cx="88" cy="52" r="4.2" fill="#ef4444" />
      <circle cx="88" cy="52" r="1.6" fill="#fde047" />
      <path d="M61 75 q4 -4 8 0 M73 75 q4 -4 8 0" stroke="#3f2a1d" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="70" cy="64" r="1.6" fill="#dc2626" />
      <path d="M65 84 q5 4 10 0" stroke="#be123c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx="59" cy="81" rx="4" ry="2.6" fill="#fda4af" opacity="0.7" />
      <ellipse cx="81" cy="81" rx="4" ry="2.6" fill="#fda4af" opacity="0.7" />
      <circle cx="47" cy="80" r="2" fill="#fbbf24" />
      <circle cx="93" cy="80" r="2" fill="#fbbf24" />
      {/* Brother */}
      <path d="M128 104 Q152 96 176 104 L180 184 Q152 192 124 184 Z" fill="#0ea5e9" />
      <path d="M152 104 V150" stroke="#0369a1" strokeWidth="1.4" />
      {[112, 122, 132, 142].map((y) => (
        <circle key={y} cx="152" cy={y} r="1.4" fill="#fbbf24" />
      ))}
      <path d="M132 112 Q122 120 114 126" stroke="#0ea5e9" strokeWidth="10" strokeLinecap="round" fill="none" />
      <circle cx="111" cy="127" r="5.2" fill={him} />
      <path d="M174 112 Q186 128 182 146" stroke="#0ea5e9" strokeWidth="10" strokeLinecap="round" fill="none" />
      <circle cx="182" cy="150" r="5.2" fill={him} />
      <rect x="180" y="150" width="16" height="14" rx="2" fill="#a855f7" />
      <path d="M188 150 V164 M180 157 H196" stroke="#fde047" strokeWidth="2" />
      <path d="M188 150 q-5 -6 -8 -1 M188 150 q5 -6 8 -1" stroke="#fde047" strokeWidth="1.6" fill="none" />
      <rect x="148" y="86" width="8" height="12" fill={him} />
      <circle cx="152" cy="70" r="24" fill={him} />
      <path d="M128 70 Q128 44 152 44 Q178 44 176 70 Q168 56 150 58 Q136 58 128 70 Z" fill="#111827" />
      <path d="M152 57 V66" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
      <circle cx="152" cy="67.5" r="1.2" fill="#fffaf0" />
      <path d="M143 74 q4 -4 8 0 M155 74 q4 -4 8 0" stroke="#3f2a1d" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M147 83 q5 4 10 0" stroke="#9f1239" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx="141" cy="80" rx="4" ry="2.6" fill="#fda4af" opacity="0.6" />
      <ellipse cx="163" cy="80" rx="4" ry="2.6" fill="#fda4af" opacity="0.6" />
      {/* The rakhi on his wrist */}
      <path d="M112 122 L118 132" stroke="#dc2626" strokeWidth="2.2" />
      {ring(8, 4.6, 119, 125).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill={i % 2 ? '#f97316' : '#ef4444'} />
      ))}
      <circle cx="119" cy="125" r="3" fill="#fde047" />
      {/* A heart and sparkles */}
      <path d="M110 46 C110 40 102 38 102 45 C102 50 110 54 110 56 C110 54 118 50 118 45 C118 38 110 40 110 46 Z" fill="#f472b6" />
      {[
        [126, 112],
        [104, 110],
        [128, 138],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1} Z`} fill="#fde047" />
      ))}
    </>
  )
}

/* ===================== Which festival shows whom ===================== */

const ART: Record<string, { draw: Draw; viewBox: string; label: string }> = {
  diwali: { draw: lakshmi, viewBox: '0 0 200 230', label: 'Goddess Lakshmi' },
  janmashtami: { draw: krishna, viewBox: '0 0 200 220', label: 'Bal Krishna' },
  maha_shivratri: { draw: shiva, viewBox: '0 0 200 230', label: 'Lord Shiva' },
  ganesh_chaturthi: { draw: ganesha, viewBox: '0 0 200 230', label: 'Lord Ganesha' },
  raksha_bandhan: { draw: siblings, viewBox: '0 0 220 200', label: 'A sister tying a rakhi on her brother' },
}

export const hasFestivalArt = (festivalId: string) => festivalId in ART

/** The festival's deity or characters, or nothing when it has none. Width is the size; height follows the drawing. */
export function FestivalArt({ festivalId, size = 120, className }: { festivalId: string; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const art = ART[festivalId]
  if (!art) return null
  const [, , w, h] = art.viewBox.split(' ').map(Number)
  return (
    <svg width={size} height={Math.round((size * h) / w)} viewBox={art.viewBox} className={cn('overflow-visible', className)} role="img" aria-label={art.label}>
      <title>{art.label}</title>
      {art.draw(id)}
    </svg>
  )
}
