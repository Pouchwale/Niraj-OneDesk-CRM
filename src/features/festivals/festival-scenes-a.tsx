/**
 * Festival scenes, January to May (18 Nov 2026, the user's request: every
 * festival shows its deity or the people celebrating it, not just an emoji).
 */

import { along, Face, GoldDefs, Halo, Kalash, Kite, Lotus, Marigolds, PeacockFeather, Rangoli, ring, Sparkle, Sun, Toran, Crown, Tiranga, type Draw } from './festival-art-kit'

/** A sugarcane stalk; y is its foot, top its tip, lean how far the tip leans sideways. */
export function Sugarcane({ x, y = 214, top = 60, lean = 0 }: { x: number; y?: number; top?: number; lean?: number }) {
  const tx = x + lean
  return (
    <g>
      <path d={`M${x} ${y} Q${x} ${(y + top) / 2} ${tx} ${top}`} stroke="#6d28d9" strokeWidth="6" strokeLinecap="round" fill="none" />
      {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t) => {
        const yy = y + (top - y) * t
        const xx = x + lean * t * t
        return <path key={t} d={`M${xx - 3.5} ${yy} h7`} stroke="#c4b5fd" strokeWidth="1.4" />
      })}
      <path d={`M${tx} ${top} q-16 -6 -26 6 M${tx} ${top} q14 -10 26 -2 M${tx} ${top} q2 -16 -6 -28 M${tx} ${top} q-4 -12 -18 -16`} stroke="#16a34a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  )
}

/** Layered fire; y is its base. */
export function Flame({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C-11 -5 -9 -20 0 -30 C2 -22 8 -20 6 -12 C11 -14 11 -5 0 0 Z" fill="#ef4444" />
      <path d="M0 -1 C-7 -5 -5 -14 0 -21 C2 -15 5 -12 4 -8 C7 -9 6 -4 0 -1 Z" fill="#f97316" />
      <path d="M0 -2 C-3.4 -4 -3 -9 0 -13 C1 -10 3 -8 2 -6 C3.4 -6 3 -3 0 -2 Z" fill="#fde047" />
    </g>
  )
}

/* ===================== Makar Sankranti: kites on the terrace ===================== */

const makarSankranti: Draw = (id) => {
  const skin = '#f1c27d'
  return (
    <>
      <Halo id={id} cx={110} cy={96} r={108} inner="#fffbe6" outer="#7dd3fc" />
      <Sun cx={44} cy={44} r={16} />
      {/* Other kites over the rooftops */}
      <path d="M92 60 Q60 110 14 128" stroke="#64748b" strokeWidth="0.6" fill="none" opacity="0.6" />
      <Kite x={92} y={44} s={0.85} a="#22c55e" b="#f97316" rot={12} />
      <path d="M128 90 Q170 116 214 112" stroke="#64748b" strokeWidth="0.6" fill="none" opacity="0.6" />
      <Kite x={128} y={78} s={0.62} a="#8b5cf6" b="#f472b6" rot={-18} />
      {/* His kite, its string down to his hand and on to the spool */}
      <path d="M171 60 Q178 86 163 104 Q150 128 126 150" stroke="#334155" strokeWidth="0.9" fill="none" />
      <Kite x={170} y={36} s={1.25} a="#ef4444" b="#fde047" rot={-10} />
      {/* The boy */}
      <path d="M145 166 L142 192 M156 166 L159 192" stroke="#1d4ed8" strokeWidth="7" strokeLinecap="round" />
      <path d="M137 168 L140 132 Q150 124 160 132 L163 168 Q150 174 137 168 Z" fill="#f97316" />
      <path d="M150 128 V150" stroke="#c2410c" strokeWidth="1.2" />
      {[134, 140, 146].map((y) => (
        <circle key={y} cx="150" cy={y} r="1" fill="#fde68a" />
      ))}
      <path d="M158 134 Q171 120 163 106" stroke={skin} strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="163" cy="104" r="3.6" fill={skin} />
      <path d="M142 134 Q129 140 127 150" stroke={skin} strokeWidth="6" strokeLinecap="round" fill="none" />
      <g transform="translate(122 155)">
        <rect x="-8" y="-7" width="16" height="13" rx="3" fill="#fde047" stroke="#ca8a04" />
        <path d="M-8 -2.5 h16 M-8 1.5 h16" stroke="#ef4444" strokeWidth="1.2" />
        <path d="M-4 6 v8 M4 6 v8" stroke="#92400e" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <rect x="146" y="118" width="8" height="8" fill={skin} />
      <Face x={150} y={110} r={13} skin={skin} look="child" earrings={false} />
      {/* The terrace wall, and til-gud laddoos */}
      <rect x="12" y="186" width="196" height="20" rx="4" fill="#e7e5e4" stroke="#a8a29e" />
      <path d="M12 196 H208 M50 186 V196 M100 186 V196 M150 186 V196 M75 196 V206 M125 196 V206 M175 196 V206" stroke="#d6d3d1" strokeWidth="1" />
      <path d="M34 186 Q50 200 66 186 Z" fill="#b45309" />
      {[
        [42, 182],
        [50, 180],
        [58, 182],
        [46, 175],
        [54, 175],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4.4" fill="#d97706" />
          <circle cx={x - 1} cy={y - 1} r="0.8" fill="#fef3c7" />
          <circle cx={x + 1.4} cy={y + 0.6} r="0.7" fill="#fef3c7" />
        </g>
      ))}
    </>
  )
}

/* ===================== Pongal: the pot boiling over at sunrise ===================== */

const pongal: Draw = (id) => (
  <>
    <Halo id={id} cx={110} cy={92} r={108} inner="#fffbe6" outer="#fb923c" />
    <Sun cx={110} cy={50} r={24} />
    <Sugarcane x={26} lean={8} top={64} />
    <Sugarcane x={40} lean={14} top={74} />
    <Sugarcane x={194} lean={-8} top={64} />
    <Sugarcane x={180} lean={-14} top={74} />
    <Rangoli cx={110} cy={206} r={52} squash={0.2} colors={['#fff7ed', '#f472b6', '#fde047', '#22c55e', '#ef4444']} />
    {/* The hearth and its fire */}
    <Flame x={94} y={188} s={0.9} />
    <Flame x={126} y={188} s={0.9} />
    <Flame x={110} y={190} s={0.7} />
    <ellipse cx="76" cy="188" rx="14" ry="9" fill="#78716c" />
    <ellipse cx="144" cy="188" rx="14" ry="9" fill="#78716c" />
    <ellipse cx="110" cy="194" rx="12" ry="7" fill="#57534e" />
    {/* The clay pot, kolam on its side, turmeric tied at its neck */}
    <path d="M76 170 Q64 132 86 114 L134 114 Q156 132 144 170 Q110 182 76 170 Z" fill="#b45309" stroke="#7c2d12" strokeWidth="1" />
    <path d="M80 150 Q110 162 140 150" stroke="#fff7ed" strokeWidth="1.6" fill="none" strokeDasharray="1 3" strokeLinecap="round" />
    {ring(6, 7, 110, 140).map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="1.6" fill="#fff7ed" />
    ))}
    <circle cx="110" cy="140" r="2.4" fill="#fff7ed" />
    <ellipse cx="110" cy="114" rx="26" ry="6" fill="#92400e" />
    {[-40, -15, 15].map((a) => (
      <ellipse key={a} cx="84" cy="104" rx="3.4" ry="11" fill="#16a34a" transform={`rotate(${a} 86 116)`} />
    ))}
    <path d="M84 118 Q110 124 136 118" stroke="#facc15" strokeWidth="2.4" fill="none" />
    {/* Boiling over: the sign of a year of plenty */}
    <path d="M84 114 Q84 96 98 98 Q104 86 116 94 Q130 88 136 114 Z" fill="#fffbeb" stroke="#e7e5e4" strokeWidth="0.8" />
    <path d="M90 114 q-3 10 0 18 M131 114 q3 8 0 15 M112 115 q-1 6 0 10" stroke="#fffbeb" strokeWidth="5" strokeLinecap="round" fill="none" />
    {[
      [98, 104],
      [106, 99],
      [114, 103],
      [122, 98],
      [126, 106],
      [104, 108],
    ].map(([x, y], i) => (
      <ellipse key={i} cx={x} cy={y} rx="1.6" ry="0.9" fill="#e7e5e4" />
    ))}
    <path d="M100 84 q-4 -6 0 -12 q4 -6 0 -12 M114 82 q-4 -6 0 -12 q4 -6 0 -12 M126 86 q-4 -6 0 -12" stroke="#ffffff" strokeWidth="1.6" fill="none" opacity="0.8" strokeLinecap="round" />
  </>
)

/* ===================== Vasant Panchami: Goddess Saraswati ===================== */

const saraswati: Draw = (id) => {
  const skin = '#f7c9a1'
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={74} r={72} inner="#fffbe6" outer="#facc15" />
      <Lotus cx={110} base={218} spread={1.2} back="#ffffff" front="#f1f5f9" edge="#e2e8f0" edgeFront="#cbd5e1" />
      {/* Hair falling behind the shoulders */}
      <path d="M88 74 Q84 108 80 124 L100 122 Q96 100 98 78 Z" fill="#1f2937" />
      <path d="M132 74 Q136 108 140 124 L120 122 Q124 100 122 78 Z" fill="#1f2937" />
      {/* White saree */}
      <path d="M82 130 Q110 122 138 130 L172 196 Q110 214 48 196 Z" fill="#ffffff" stroke="#e5e7eb" />
      <path d="M48 196 Q110 214 172 196" stroke="#f59e0b" strokeWidth="5" fill="none" />
      <path d="M54 186 Q110 202 166 186" stroke="#fbbf24" strokeWidth="1.4" fill="none" strokeDasharray="3 3" />
      {[94, 106, 118, 130].map((x) => (
        <path key={x} d={`M${x} 136 Q${x - 2} 168 ${x - 6} 202`} stroke="#e5e7eb" strokeWidth="1.2" fill="none" />
      ))}
      {/* Upper hands: the book and the mala */}
      <path d="M94 108 Q76 100 70 86" stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M126 108 Q144 100 150 86" stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
      <g transform="rotate(-12 66 72)">
        <rect x="55" y="62" width="22" height="15" rx="1.5" fill="#b91c1c" />
        <path d="M66 62 V77" stroke="#fde68a" strokeWidth="1.2" />
        <path d="M58 66 h6 M58 70 h6 M68 66 h6 M68 70 h6" stroke="#fde68a" strokeWidth="0.7" />
      </g>
      <ellipse cx="70" cy="84" rx="5" ry="6" fill={skin} />
      {ring(14, 8, 150, 72).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.7" fill="#a16207" />
      ))}
      <ellipse cx="150" cy="84" rx="5" ry="6" fill={skin} />
      {/* Yellow blouse and the pallu */}
      <path d="M92 102 Q110 96 128 102 L127 132 Q110 138 93 132 Z" fill="#facc15" />
      <path d="M122 102 Q138 130 126 164 L114 162 Q126 132 114 106 Z" fill="#ffffff" stroke="#f59e0b" strokeWidth="1.6" />
      {/* The veena across her lap */}
      <path d="M146 164 L64 108" stroke="#92400e" strokeWidth="7" strokeLinecap="round" />
      {along(8, 140, 160, 105, 136, 70, 112).map(([x, y], i) => (
        <path key={i} d={`M${x - 2} ${y + 3} l4 -6`} stroke="#fde68a" strokeWidth="1" />
      ))}
      <path d="M146 160 L64 104 M147 163 L65 107" stroke="#fef3c7" strokeWidth="0.5" />
      <circle cx="60" cy="104" r="9" fill="#b45309" stroke="#78350f" />
      <path d="M56 98 q-6 -8 -2 -14" stroke="#92400e" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="152" cy="172" r="20" fill="#b45309" stroke="#78350f" />
      <circle cx="152" cy="172" r="12" fill="none" stroke="#fbbf24" strokeWidth="1.4" />
      <circle cx="152" cy="172" r="4" fill="#fbbf24" />
      {/* Lower hands playing it */}
      <path d="M96 116 Q86 124 90 130" stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
      <ellipse cx="90" cy="131" rx="6" ry="5" fill={skin} />
      <path d="M124 116 Q140 130 138 150" stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
      <ellipse cx="138" cy="152" rx="6" ry="5" fill={skin} />
      <path d="M89 122 l6 3 M134 142 l7 -1" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" />
      {/* Neck, pearls and face */}
      <rect x="105" y="90" width="10" height="12" fill={skin} />
      <path d="M96 100 Q110 112 124 100" stroke="#fbbf24" strokeWidth="2.6" fill="none" />
      {along(11, 94, 101, 110, 126, 126, 101).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#fffaf0" />
      ))}
      <Face x={110} y={74} r={22} skin={skin} mark="bindi" back={false} />
      <Crown id={id} cx={110} y={50} w={36} />
      {/* Her swan */}
      <g>
        <path d="M166 204 Q172 188 190 192 Q206 196 202 206 Q186 214 166 204 Z" fill="#ffffff" stroke="#cbd5e1" />
        <path d="M174 200 Q186 190 198 198 Q186 204 174 200 Z" fill="#f1f5f9" stroke="#cbd5e1" />
        <path d="M170 202 Q158 186 168 172" stroke="#cbd5e1" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M170 202 Q158 186 168 172" stroke="#ffffff" strokeWidth="5" fill="none" strokeLinecap="round" />
        <circle cx="169" cy="170" r="5" fill="#ffffff" />
        <path d="M173 169 l7 2 l-7 2.4 Z" fill="#f97316" />
        <circle cx="170" cy="168.6" r="0.9" fill="#111827" />
      </g>
      {/* Mustard flowers of spring */}
      {[
        [30, 200],
        [40, 192],
        [22, 190],
        [34, 182],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y} v16`} stroke="#65a30d" strokeWidth="1.2" />
          {ring(5, 2.6, x, y).map(([a, b], j) => (
            <circle key={j} cx={a} cy={b} r="1.6" fill="#facc15" />
          ))}
        </g>
      ))}
    </>
  )
}

/* ===================== Republic Day: a child saluting the flag ===================== */

const republicDay: Draw = (id) => {
  const skin = '#e9b489'
  return (
    <>
      <Halo id={id} cx={110} cy={100} r={108} inner="#ffffff" outer="#fdba74" />
      <path d="M58 26 V198" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="58" cy="24" r="3.4" fill="#fbbf24" />
      <Tiranga x={59} y={30} w={96} />
      <rect x="36" y="196" width="44" height="9" rx="2" fill="#a8a29e" />
      <rect x="42" y="190" width="32" height="8" rx="2" fill="#d6d3d1" />
      {/* Petals falling from the flag */}
      {[
        [90, 110],
        [120, 104],
        [104, 128],
        [140, 120],
        [80, 140],
        [126, 146],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="2.4" ry="1.5" fill={i % 2 ? '#f97316' : '#facc15'} transform={`rotate(${i * 40} ${x} ${y})`} />
      ))}
      {/* The child, in white with a tricolour badge */}
      <path d="M160 162 L157 194 M172 162 L175 194" stroke="#e2e8f0" strokeWidth="9" strokeLinecap="round" />
      <path d="M160 162 L157 194 M172 162 L175 194" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="155" cy="197" rx="6" ry="3" fill="#1f2937" />
      <ellipse cx="177" cy="197" rx="6" ry="3" fill="#1f2937" />
      <path d="M152 166 L155 128 Q166 120 177 128 L180 166 Q166 172 152 166 Z" fill="#ffffff" stroke="#e2e8f0" />
      <circle cx="171" cy="136" r="3.4" fill="#ff9933" />
      <circle cx="171" cy="136" r="2.3" fill="#ffffff" />
      <circle cx="171" cy="136" r="1.2" fill="#138808" />
      <path d="M176 130 Q183 146 179 158" stroke={skin} strokeWidth="6" strokeLinecap="round" fill="none" />
      <rect x="162" y="116" width="8" height="8" fill={skin} />
      <Face x={166} y={108} r={14} skin={skin} look="child" earrings={false} />
      <path d="M150 100 Q166 94 182 100 L178 89 Q166 85 154 89 Z" fill="#ffffff" stroke="#e2e8f0" />
      {/* The salute */}
      <path d="M157 130 Q138 124 144 112 L155 102" stroke={skin} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <ellipse cx="156" cy="101" rx="5" ry="2.6" fill={skin} transform="rotate(-30 156 101)" />
      <Sparkle x={196} y={60} r={5} />
      <Sparkle x={24} y={88} r={4} />
    </>
  )
}

/* ===================== Holika Dahan: Prahlad safe in the fire ===================== */

const holikaDahan: Draw = (id) => {
  const skin = '#f1c27d'
  return (
    <>
      <defs>
        <radialGradient id={`${id}calm`}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#e0f2fe" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#bae6fd" stopOpacity="0" />
        </radialGradient>
      </defs>
      <Halo id={id} cx={110} cy={124} r={108} inner="#fff7ed" outer="#f97316" />
      <circle cx="182" cy="34" r="14" fill="#fef3c7" />
      <Sparkle x={30} y={30} r={3} fill="#fef3c7" />
      <Sparkle x={60} y={18} r={2.4} fill="#fef3c7" />
      <Sparkle x={150} y={20} r={2.6} fill="#fef3c7" />
      {/* The bonfire behind him */}
      <Flame x={72} y={204} s={2.8} />
      <Flame x={148} y={204} s={2.8} />
      <Flame x={110} y={206} s={4.2} />
      {/* Prahlad, calm in Lord Vishnu's protection */}
      <circle cx="110" cy="150" r="40" fill={`url(#${id}calm)`} />
      <ellipse cx="110" cy="178" rx="24" ry="8" fill="#facc15" />
      <path d="M95 176 Q93 148 110 142 Q127 148 125 176 Z" fill={skin} />
      <path d="M95 150 Q110 160 125 150" stroke="#facc15" strokeWidth="4" fill="none" />
      <path d="M98 150 Q100 162 108 156 M122 150 Q120 162 112 156" stroke={skin} strokeWidth="5" strokeLinecap="round" fill="none" />
      <ellipse cx="108.5" cy="152" rx="2.6" ry="7" fill={skin} stroke="#d4a373" strokeWidth="0.6" />
      <ellipse cx="111.5" cy="152" rx="2.6" ry="7" fill={skin} stroke="#d4a373" strokeWidth="0.6" />
      {along(9, 100, 146, 110, 170, 120, 146).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.3" fill="#15803d" />
      ))}
      <rect x="106" y="132" width="8" height="10" fill={skin} />
      <Face x={110} y={124} r={13} skin={skin} look="child" closed mark="tilak" earrings={false} />
      {/* The front of the fire and the logs */}
      {[82, 98, 122, 138].map((x) => (
        <Flame key={x} x={x} y={208} s={1.1} />
      ))}
      <path d="M48 210 L172 196 M48 196 L172 210" stroke="#78350f" strokeWidth="9" strokeLinecap="round" />
      <path d="M66 214 H154" stroke="#92400e" strokeWidth="8" strokeLinecap="round" />
    </>
  )
}

/* ===================== Holi: Radha and Krishna with colours ===================== */

const holi: Draw = (id) => {
  const her = '#f8c8a0'
  const blue = '#6fa8f2'
  return (
    <>
      <Halo id={id} cx={110} cy={100} r={108} inner="#ffffff" outer="#f9a8d4" />
      {[
        [36, 58, 32, '#f472b6'],
        [184, 52, 28, '#facc15'],
        [110, 26, 24, '#22c55e'],
        [198, 140, 26, '#a855f7'],
        [20, 150, 24, '#38bdf8'],
      ].map(([x, y, r, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={c as string} opacity="0.35" />
      ))}
      {/* Radha with a plate of gulal */}
      <path d="M36 206 L52 144 L80 144 L96 206 Q66 216 36 206 Z" fill="#db2777" />
      <path d="M36 206 Q66 216 96 206" stroke="#fbbf24" strokeWidth="4" fill="none" />
      <path d="M42 190 Q66 198 90 190" stroke="#fde68a" strokeWidth="1.2" fill="none" strokeDasharray="2 3" />
      <path d="M50 114 Q66 106 82 114 L82 146 L50 146 Z" fill="#f59e0b" />
      <path d="M82 112 L48 150" stroke="#a3e635" strokeWidth="7" strokeLinecap="round" opacity="0.9" />
      <path d="M52 118 Q38 128 36 138" stroke={her} strokeWidth="7" strokeLinecap="round" fill="none" />
      <ellipse cx="30" cy="142" rx="16" ry="4.6" fill="#fbbf24" stroke="#d97706" />
      <path d="M18 141 q4 -6 8 0 Z M26 140 q4 -7 8 0 Z M34 141 q4 -6 8 0 Z" fill="#ec4899" />
      <path d="M26 140 q4 -7 8 0 Z" fill="#22c55e" />
      <path d="M80 118 Q96 108 100 92" stroke={her} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="101" cy="90" r="4" fill={her} />
      {[
        [108, 80, 7],
        [116, 72, 6],
        [104, 70, 5],
        [118, 84, 4],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#f472b6" opacity="0.55" />
      ))}
      <rect x="62" y="98" width="8" height="10" fill={her} />
      <Face x={66} y={84} r={19} skin={her} mark="bindi" />
      <ellipse cx="56" cy="92" rx="4" ry="2.4" fill="#22c55e" opacity="0.6" />
      <circle cx="82" cy="68" r="4" fill="#ef4444" />
      {/* Krishna with his pichkari */}
      <path d="M128 206 L132 146 L176 146 L180 206 Q154 214 128 206 Z" fill="#facc15" />
      <path d="M128 206 Q154 214 180 206" stroke="#dc2626" strokeWidth="3" fill="none" />
      <path d="M134 114 Q154 106 174 114 L176 150 L132 150 Z" fill={blue} />
      <path d="M134 114 L176 150" stroke="#f97316" strokeWidth="6" opacity="0.9" />
      {along(9, 138, 114, 154, 160, 170, 114).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill={i % 2 ? '#fde047' : '#ef4444'} />
      ))}
      <path d="M137 120 Q124 126 118 120" stroke={blue} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M172 120 Q164 136 146 130" stroke={blue} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M104 112 L146 128" stroke="#d97706" strokeWidth="7" strokeLinecap="round" />
      <path d="M104 112 L146 128" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
      <path d="M146 128 L160 133" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
      <circle cx="118" cy="118" r="4.6" fill={blue} />
      <circle cx="144" cy="128" r="4.6" fill={blue} />
      {along(10, 100, 109, 90, 92, 76, 96).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2 + (i % 3) * 0.6} fill={['#ec4899', '#a855f7', '#38bdf8'][i % 3]} />
      ))}
      <PeacockFeather x={166} y={52} rot={22} s={0.75} />
      <rect x="150" y="96" width="8" height="10" fill={blue} />
      <Face x={154} y={82} r={19} skin={blue} look="man" mark="tilak" earrings lips="#1e3a8a" />
      <rect x="138" y="62" width="32" height="5" rx="2.5" fill="#fbbf24" />
      <ellipse cx="164" cy="88" rx="4" ry="2.4" fill="#f472b6" opacity="0.7" />
    </>
  )
}

/* ===================== Gudi Padwa: the Gudi raised for the new year ===================== */

const gudiPadwa: Draw = (id) => (
  <>
    <defs>
      <linearGradient id={`${id}copper`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fdba74" />
        <stop offset="100%" stopColor="#c2410c" />
      </linearGradient>
    </defs>
    <Halo id={id} cx={110} cy={92} r={108} inner="#fffbe6" outer="#f59e0b" />
    <Sun cx={184} cy={40} r={13} />
    <Rangoli cx={110} cy={204} r={48} squash={0.24} />
    <path d="M110 204 V60" stroke="#a16207" strokeWidth="4" strokeLinecap="round" />
    <ellipse cx="110" cy="200" rx="12" ry="4" fill="#92400e" />
    {/* The silk cloth, pleated */}
    <path d="M110 64 Q88 92 80 140 Q96 146 110 142 Q124 146 140 140 Q132 92 110 64 Z" fill="#facc15" />
    <path d="M110 66 L96 142 M110 66 L110 142 M110 66 L124 142 M110 66 L86 136 M110 66 L134 136" stroke="#eab308" strokeWidth="1.1" />
    <path d="M80 140 Q96 146 110 142 Q124 146 140 140" stroke="#16a34a" strokeWidth="5" fill="none" />
    {[90, 102, 118, 130].map((x, i) => (
      <circle key={x} cx={x} cy={124 - (i % 2) * 6} r="1.6" fill="#dc2626" />
    ))}
    {/* Neem, marigolds and the sugar garland */}
    {[-70, -45, -20, 20, 45, 70].map((a) => (
      <ellipse key={a} cx="110" cy="52" rx="2.6" ry="9" fill="#15803d" transform={`rotate(${a} 110 64)`} />
    ))}
    {along(10, 94, 66, 110, 100, 126, 66).map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="2.8" fill={['#ffffff', '#f9a8d4', '#fde68a'][i % 3]} stroke="#e5e7eb" strokeWidth="0.5" />
    ))}
    <Marigolds x0={92} y0={64} cx={110} cy={82} x1={128} y1={64} n={9} r={3.4} />
    {/* The copper pot, upside down on top */}
    <path d="M100 60 L120 60 L122 53 Q135 44 127 30 Q110 17 93 30 Q85 44 98 53 Z" fill={`url(#${id}copper)`} stroke="#9a3412" strokeWidth="0.8" />
    <ellipse cx="110" cy="60" rx="11" ry="3" fill="#9a3412" />
    <path d="M106 38 h8 M110 34 v8 M106 38 v-4 M114 38 v4 M110 34 h4 M110 42 h-4" stroke="#fef3c7" strokeWidth="1.2" />
    <ellipse cx="102" cy="34" rx="3" ry="5" fill="#ffffff" opacity="0.35" />
  </>
)

/* ===================== Ugadi: kalash, mango leaves and pachadi ===================== */

const ugadi: Draw = (id) => (
  <>
    <GoldDefs id={id} />
    <Halo id={id} cx={110} cy={112} r={108} inner="#fffbe6" outer="#84cc16" />
    <Toran x0={6} x1={214} y={18} sag={10} />
    <Rangoli cx={110} cy={206} r={64} squash={0.18} />
    <Kalash x={64} y={194} s={1.5} />
    {/* The pachadi of six tastes */}
    <path d="M116 176 Q150 208 184 176 Z" fill={`url(#${id}gold)`} stroke="#b45309" />
    <ellipse cx="150" cy="176" rx="34" ry="7" fill="#d97706" />
    <ellipse cx="150" cy="176" rx="30" ry="5" fill="#a16207" />
    {[
      [138, 175, '#fef9c3'],
      [146, 177, '#84cc16'],
      [155, 174, '#fde047'],
      [162, 177, '#ffffff'],
      [142, 178, '#fef3c7'],
      [158, 178, '#facc15'],
    ].map(([x, y, c], i) => (
      <rect key={i} x={(x as number) - 1.6} y={(y as number) - 1.2} width="3.2" height="2.4" rx="0.6" fill={c as string} />
    ))}
    <path d="M170 172 L192 150" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="168" cy="174" rx="5" ry="3" fill="#d97706" />
    {/* Raw mango, jaggery and neem flowers */}
    <ellipse cx="114" cy="200" rx="9" ry="7" fill="#84cc16" transform="rotate(-20 114 200)" />
    <path d="M118 193 q3 -4 6 -3" stroke="#3f6212" strokeWidth="1.2" fill="none" />
    <rect x="182" y="190" width="14" height="11" rx="2" fill="#92400e" />
    <path d="M196 170 Q200 182 194 196" stroke="#4d7c0f" strokeWidth="1.4" fill="none" />
    {[
      [196, 172],
      [200, 178],
      [194, 180],
      [199, 186],
    ].map(([x, y], i) => (
      <g key={i}>
        <ellipse cx={x + 4} cy={y} rx="1.8" ry="4" fill="#16a34a" transform={`rotate(60 ${x + 4} ${y})`} />
        <circle cx={x - 2} cy={y - 2} r="1.4" fill="#ffffff" />
      </g>
    ))}
    <Sparkle x={196} y={70} r={5} />
    <Sparkle x={26} y={84} r={4} />
  </>
)

/* ===================== Navreh: the Kashmiri new-year thaal ===================== */

function Chinar({ x, y, rot = 0, s = 1, fill = '#dc2626' }: { x: number; y: number; rot?: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 14 L0 2 L-12 6 L-8 -2 L-16 -8 L-6 -8 L-8 -18 L0 -10 L8 -18 L6 -8 L16 -8 L8 -2 L12 6 L0 2 Z" fill={fill} />
      <path d="M0 14 V-10 M0 2 L-10 -4 M0 2 L10 -4" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" fill="none" />
    </g>
  )
}

const navreh: Draw = (id) => (
  <>
    <GoldDefs id={id} />
    <Halo id={id} cx={110} cy={112} r={108} inner="#fff7ed" outer="#fb7185" />
    <Chinar x={30} y={40} rot={-20} s={1.4} />
    <Chinar x={190} y={34} rot={24} s={1.2} fill="#ea580c" />
    <Chinar x={170} y={72} rot={-10} s={0.9} fill="#f59e0b" />
    <Chinar x={48} y={82} rot={30} s={0.8} fill="#f97316" />
    {/* The thaal */}
    <ellipse cx="110" cy="152" rx="94" ry="40" fill={`url(#${id}gold)`} stroke="#b45309" strokeWidth="1.2" />
    <ellipse cx="110" cy="150" rx="84" ry="34" fill="#fcd34d" opacity="0.5" />
    {/* Rice heaped in the middle, a walnut and a coin on it */}
    <path d="M76 154 Q110 106 144 154 Q110 162 76 154 Z" fill="#fffbeb" stroke="#e7e5e4" />
    {[
      [96, 140],
      [104, 132],
      [116, 136],
      [124, 146],
      [100, 150],
      [118, 150],
      [110, 124],
    ].map(([x, y], i) => (
      <ellipse key={i} cx={x} cy={y} rx="1.4" ry="0.8" fill="#e7e5e4" />
    ))}
    <circle cx="102" cy="126" r="5.4" fill="#92400e" />
    <path d="M102 121 v10" stroke="#78350f" strokeWidth="0.8" />
    <circle cx="118" cy="128" r="4.4" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
    {/* The mirror, bread, curd, pen and almanac, flowers */}
    <ellipse cx="54" cy="146" rx="16" ry="12" fill="#e0f2fe" stroke="#d97706" strokeWidth="3" />
    <path d="M46 142 l8 -6 M50 150 l10 -8" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
    <ellipse cx="72" cy="170" rx="13" ry="7" fill="#d6a35c" />
    {[
      [68, 168],
      [74, 170],
      [78, 167],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="0.9" fill="#92400e" />
    ))}
    <ellipse cx="132" cy="172" rx="11" ry="5" fill="#fef3c7" stroke="#d6d3d1" />
    <ellipse cx="132" cy="171" rx="8" ry="3" fill="#ffffff" />
    <g transform="rotate(-14 160 156)">
      <rect x="148" y="148" width="26" height="17" rx="1.5" fill="#b91c1c" />
      <path d="M152 153 h18 M152 157 h18 M152 161 h12" stroke="#fde68a" strokeWidth="0.8" />
    </g>
    <path d="M150 170 L180 160" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    {ring(8, 4, 160, 132).map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="2.6" fill="#f97316" />
    ))}
    <circle cx="160" cy="132" r="2.2" fill="#facc15" />
    <circle cx="174" cy="142" r="5" fill="#e11d48" />
    <circle cx="174" cy="142" r="2.4" fill="#be123c" />
    {[
      [88, 172],
      [150, 182],
      [40, 162],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="3.6" fill="#92400e" />
    ))}
  </>
)

/* ===================== Ram Navami: Lord Rama ===================== */

const rama: Draw = (id) => {
  const skin = '#6fa8f2'
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={82} r={100} inner="#fff7d6" outer="#f97316" />
      <circle cx="110" cy="78" r="48" fill="none" stroke="#fdba74" strokeWidth="2" strokeDasharray="3 5" />
      <path d="M188 14 V70" stroke="#a16207" strokeWidth="2" />
      <path d="M188 16 L212 26 L196 30 L212 36 L188 42 Z" fill="#f97316" />
      {/* Quiver of arrows behind his shoulder */}
      <path d="M134 78 L146 72 L166 136 L154 142 Z" fill="#92400e" stroke="#78350f" />
      {[136, 142, 148].map((x, i) => (
        <path key={x} d={`M${x} ${74 - i * 2} l-3 -10 l3 3 l3 -3 Z`} fill={i % 2 ? '#ffffff' : '#dc2626'} />
      ))}
      {/* The bow */}
      <path d="M50 30 Q12 120 50 210" stroke="#92400e" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M50 30 L50 210" stroke="#fde68a" strokeWidth="1" />
      {/* Long hair behind the shoulders */}
      <path d="M88 82 Q84 112 80 128 L96 126 Q92 104 94 88 Z" fill="#1f2937" />
      <path d="M132 82 Q136 112 140 128 L124 126 Q128 104 126 88 Z" fill="#1f2937" />
      {/* Body, pitambar and garland */}
      <path d="M74 124 Q110 110 146 124 L152 216 L68 216 Z" fill={skin} />
      <path d="M66 172 Q110 162 154 172 L158 216 L62 216 Z" fill="#facc15" />
      <path d="M66 172 Q110 162 154 172" stroke="#dc2626" strokeWidth="4" fill="none" />
      <path d="M80 124 Q112 152 148 130" stroke="#fbbf24" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M84 124 L132 170" stroke="#fde68a" strokeWidth="1.4" />
      {along(13, 84, 124, 110, 188, 136, 124).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill={i % 2 ? '#fde047' : '#ef4444'} />
      ))}
      <path d="M92 120 Q110 134 128 120" stroke="#fbbf24" strokeWidth="3" fill="none" />
      {/* One hand on the bow, one raised in blessing */}
      <path d="M77 130 Q54 132 46 122" stroke={skin} strokeWidth="11" strokeLinecap="round" fill="none" />
      <ellipse cx="44" cy="120" rx="7" ry="8" fill={skin} />
      <path d="M58 128 l2 -8" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M144 130 Q162 168 166 140" stroke={skin} strokeWidth="10" strokeLinecap="round" fill="none" />
      <ellipse cx="166" cy="132" rx="7" ry="10" fill={skin} />
      <path d="M161 124 v-4 M165 123 v-5 M169 124 v-4" stroke={skin} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="166" cy="134" r="1.8" fill="#dc2626" />
      <path d="M156 152 l9 -3" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <rect x="104" y="100" width="12" height="14" fill={skin} />
      <Face x={110} y={82} r={24} skin={skin} look="man" mark="tilak" earrings lips="#1e3a8a" />
      <Crown id={id} cx={110} y={58} w={42} />
    </>
  )
}

/* ===================== Hanuman Jayanti: Lord Hanuman ===================== */

const hanuman: Draw = (id) => {
  const skin = '#f97316'
  const light = '#fed7aa'
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={92} r={102} inner="#fff7ed" outer="#fb923c" />
      {/* Tail curling behind him */}
      <path d="M78 196 Q24 190 26 142 Q28 104 54 110 Q68 116 60 128" stroke={skin} strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* The Sanjeevani mountain in his raised hand */}
      <path d="M18 72 L34 42 L44 52 L58 30 L78 72 Z" fill="#65a30d" stroke="#3f6212" />
      <path d="M58 30 L66 52 L78 72 L60 72 Z" fill="#4d7c0f" />
      {[
        [32, 60],
        [46, 64],
        [60, 58],
        [68, 66],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y + 6} v-4`} stroke="#78350f" strokeWidth="1.2" />
          <circle cx={x} cy={y} r="3.4" fill="#22c55e" />
        </g>
      ))}
      <Sparkle x={40} y={46} r={3} />
      <Sparkle x={64} y={44} r={2.6} />
      <path d="M78 122 Q50 110 48 80" stroke={skin} strokeWidth="11" strokeLinecap="round" fill="none" />
      <ellipse cx="48" cy="76" rx="8" ry="6" fill={skin} />
      <path d="M54 100 l7 -4" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      {/* His mace on the shoulder */}
      <path d="M150 184 L176 72" stroke={`url(#${id}gold)`} strokeWidth="6" strokeLinecap="round" />
      <circle cx="179" cy="58" r="20" fill={`url(#${id}gold)`} stroke="#b45309" />
      <path d="M163 54 Q179 46 195 54 M161 62 Q179 70 197 62 M179 38 V78" stroke="#b45309" strokeWidth="1.2" fill="none" />
      <circle cx="179" cy="36" r="4" fill="#fbbf24" stroke="#b45309" />
      <circle cx="149" cy="188" r="4" fill="#fbbf24" stroke="#b45309" />
      {/* Body, dhoti and sash */}
      <path d="M74 124 Q110 108 146 124 L150 196 L70 196 Z" fill={skin} />
      <path d="M92 140 q8 6 16 0 M112 140 q8 6 16 0" stroke="#ea580c" strokeWidth="1.4" fill="none" />
      <path d="M66 176 Q110 166 154 176 L158 216 L62 216 Z" fill="#dc2626" />
      <path d="M66 176 Q110 166 154 176 M62 214 H158" stroke="#fbbf24" strokeWidth="3" fill="none" />
      <path d="M78 124 Q112 156 146 128" stroke="#facc15" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M86 124 L134 176" stroke="#fde68a" strokeWidth="1.4" />
      <path d="M92 120 Q110 134 128 120" stroke="#fbbf24" strokeWidth="3" fill="none" />
      <path d="M146 128 Q166 136 160 146" stroke={skin} strokeWidth="11" strokeLinecap="round" fill="none" />
      <ellipse cx="160" cy="146" rx="7" ry="6" fill={skin} />
      {/* His face */}
      <circle cx="86" cy="84" r="8" fill={skin} />
      <circle cx="134" cy="84" r="8" fill={skin} />
      <circle cx="86" cy="84" r="4.6" fill={light} />
      <circle cx="134" cy="84" r="4.6" fill={light} />
      <circle cx="110" cy="82" r="26" fill={skin} />
      <path d="M90 86 Q90 64 110 64 Q130 64 130 86 Q130 110 110 112 Q90 110 90 86 Z" fill={light} />
      <ellipse cx="110" cy="98" rx="14" ry="11" fill={light} stroke="#fdba74" />
      <ellipse cx="110" cy="91" rx="3.4" ry="2.2" fill="#7c2d12" />
      <path d="M101 100 q9 7 18 0" stroke="#7c2d12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx="101" cy="80" rx="3.2" ry="3.8" fill="#1f2937" />
      <ellipse cx="119" cy="80" rx="3.2" ry="3.8" fill="#1f2937" />
      <circle cx="102" cy="79" r="1" fill="#ffffff" />
      <circle cx="120" cy="79" r="1" fill="#ffffff" />
      <path d="M95 73 q6 -3 11 0 M114 73 q6 -3 11 0" stroke="#7c2d12" strokeWidth="1.4" fill="none" />
      <path d="M110 60 V72" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
      <Crown id={id} cx={110} y={58} w={40} />
    </>
  )
}

/* ===================== Baisakhi: Bhangra at the harvest ===================== */

const baisakhi: Draw = (id) => {
  const skin = '#e9b489'
  return (
    <>
      <Halo id={id} cx={110} cy={96} r={108} inner="#fffbe6" outer="#facc15" />
      <Sun cx={38} cy={40} r={16} />
      {/* Wheat ready for harvest */}
      {Array.from({ length: 22 }, (_, i) => {
        const x = 6 + i * 10
        const top = 168 + (i % 3) * 7
        const tip = x + (i % 2 ? 4 : -4)
        return (
          <g key={i}>
            <path d={`M${x} 220 Q${x + 2} ${top + 20} ${tip} ${top}`} stroke="#ca8a04" strokeWidth="1.4" fill="none" />
            <ellipse cx={tip} cy={top - 6} rx="2.6" ry="7" fill="#eab308" transform={`rotate(${i % 2 ? 12 : -12} ${tip} ${top - 6})`} />
          </g>
        )
      })}
      {/* The dhol */}
      <g>
        <rect x="160" y="160" width="44" height="34" rx="6" fill="#dc2626" />
        <path d="M162 162 L172 192 L182 162 L192 192 L202 162" stroke="#fde68a" strokeWidth="1.4" fill="none" />
        <ellipse cx="160" cy="177" rx="6" ry="17" fill="#fef3c7" stroke="#92400e" />
        <ellipse cx="204" cy="177" rx="6" ry="17" fill="#fef3c7" stroke="#92400e" />
        <path d="M150 150 Q182 140 214 156" stroke="#7c2d12" strokeWidth="2" fill="none" />
      </g>
      {/* The dancer: tehmat, kurta, waistcoat, arms up */}
      <path d="M82 196 L88 150 L122 150 L130 196 Q106 204 82 196 Z" fill="#7c3aed" />
      {[160, 172, 184].map((y) => (
        <path key={y} d={`M${86 - (y - 150) * 0.06} ${y} H${126 + (y - 150) * 0.08}`} stroke="#facc15" strokeWidth="2" />
      ))}
      <path d="M96 196 L94 210" stroke={skin} strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="94" cy="212" rx="7" ry="3" fill="#d97706" />
      <path d="M118 188 Q134 196 128 206" stroke={skin} strokeWidth="6" strokeLinecap="round" fill="none" />
      <ellipse cx="130" cy="208" rx="7" ry="3" fill="#d97706" transform="rotate(-20 130 208)" />
      <path d="M86 154 L88 118 Q106 108 124 118 L126 154 Q106 160 86 154 Z" fill="#22c55e" />
      <path d="M88 120 L104 116 L102 154 L87 153 Z" fill="#1d4ed8" stroke="#facc15" strokeWidth="1.2" />
      <path d="M124 120 L108 116 L110 154 L125 153 Z" fill="#1d4ed8" stroke="#facc15" strokeWidth="1.2" />
      <path d="M90 122 Q70 104 66 82" stroke="#22c55e" strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="65" cy="77" r="5" fill={skin} />
      <path d="M65 72 L52 60 L62 58 Z" fill="#ef4444" />
      <path d="M122 122 Q142 104 146 82" stroke="#22c55e" strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="147" cy="77" r="5" fill={skin} />
      <rect x="101" y="104" width="10" height="10" fill={skin} />
      <Face x={106} y={94} r={17} skin={skin} look="none" beard="#111827" earrings={false} />
      {/* The turban and its fan */}
      <path d="M112 64 Q120 40 134 34 Q128 50 124 64 Z" fill="#facc15" />
      <path d="M116 60 L128 38 M120 62 L131 42" stroke="#f97316" strokeWidth="1" />
      <path d="M86 90 Q84 62 106 58 Q129 58 127 88 Q118 76 106 78 Q95 78 86 90 Z" fill="#f97316" />
      <path d="M88 84 Q106 70 125 80 M90 76 Q108 64 124 72" stroke="#ea580c" strokeWidth="1.6" fill="none" />
    </>
  )
}

/* ===================== Akshaya Tritiya: gold that never runs out ===================== */

function Foot({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <ellipse cx="0" cy="0" rx="4.4" ry="8" fill="#dc2626" />
      {[-4, -1.6, 0.8, 3, 4.8].map((tx, i) => (
        <circle key={i} cx={tx} cy={-9.5 + Math.abs(tx) * 0.3} r={i === 0 ? 1.7 : 1.2} fill="#dc2626" />
      ))}
    </g>
  )
}

const akshayaTritiya: Draw = (id) => {
  const coins = [
    [96, 134],
    [106, 128],
    [118, 124],
    [130, 128],
    [140, 134],
    [102, 120],
    [114, 116],
    [126, 118],
    [110, 108],
    [122, 108],
    [116, 99],
  ]
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={110} r={108} inner="#fffbe6" outer="#f59e0b" />
      {/* Lakshmi's footsteps, walking in */}
      <Foot x={30} y={208} rot={-60} />
      <Foot x={44} y={198} rot={-60} />
      <Foot x={52} y={210} rot={-60} />
      <Foot x={66} y={200} rot={-60} />
      {/* The pot of gold */}
      {coins.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill="#fbbf24" stroke="#b45309" />
          <circle cx={x} cy={y} r="4.4" fill="none" stroke="#fde68a" strokeWidth="0.9" />
        </g>
      ))}
      <path d="M82 198 Q72 158 94 142 L142 142 Q164 158 154 198 Q118 212 82 198 Z" fill={`url(#${id}gold)`} stroke="#b45309" />
      <ellipse cx="118" cy="142" rx="26" ry="6" fill="#d97706" />
      <path d="M114 166 h8 M118 162 v8 M114 166 v-4 M122 166 v4 M118 162 h4 M118 170 h-4" stroke="#dc2626" strokeWidth="1.6" />
      {along(13, 92, 156, 118, 188, 144, 156).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#fde68a" stroke="#b45309" strokeWidth="0.5" />
      ))}
      <circle cx="118" cy="174" r="3.6" fill="#dc2626" stroke="#fde68a" />
      {[
        [76, 206],
        [92, 210],
        [150, 210],
        [166, 204],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="7" ry="3" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      ))}
      <Kalash x={184} y={196} s={1} />
      {/* Barley, the grain of the day */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <path d={`M${30 + i * 6} 168 Q${32 + i * 4} 130 ${26 + i * 8} 100`} stroke="#a16207" strokeWidth="1.4" fill="none" />
          {[0, 1, 2, 3].map((j) => (
            <ellipse key={j} cx={26 + i * 8 + (j % 2 ? 2.5 : -2.5)} cy={104 + j * 6} rx="2" ry="4" fill="#eab308" transform={`rotate(${j % 2 ? 25 : -25} ${26 + i * 8} ${104 + j * 6})`} />
          ))}
        </g>
      ))}
      <Sparkle x={70} y={60} r={6} />
      <Sparkle x={160} y={70} r={5} />
      <Sparkle x={118} y={80} r={4} />
    </>
  )
}

export const SCENES_A: Record<string, { draw: Draw; viewBox: string; label: string }> = {
  makar_sankranti: { draw: makarSankranti, viewBox: '0 0 220 220', label: 'A boy flying a kite from the terrace' },
  pongal: { draw: pongal, viewBox: '0 0 220 220', label: 'The Pongal pot boiling over at sunrise' },
  vasant_panchami: { draw: saraswati, viewBox: '0 0 220 220', label: 'Goddess Saraswati with her veena' },
  republic_day: { draw: republicDay, viewBox: '0 0 220 220', label: 'A child saluting the national flag' },
  holika_dahan: { draw: holikaDahan, viewBox: '0 0 220 220', label: 'Bhakt Prahlad safe in the Holika fire' },
  holi: { draw: holi, viewBox: '0 0 220 220', label: 'Radha and Krishna playing with colours' },
  gudi_padwa: { draw: gudiPadwa, viewBox: '0 0 220 220', label: 'The Gudi raised for the new year' },
  ugadi: { draw: ugadi, viewBox: '0 0 220 220', label: 'Kalash, mango leaves and Ugadi pachadi' },
  navreh: { draw: navreh, viewBox: '0 0 220 220', label: 'The Navreh thaal' },
  ram_navami: { draw: rama, viewBox: '0 0 220 220', label: 'Lord Rama' },
  hanuman_jayanti: { draw: hanuman, viewBox: '0 0 220 220', label: 'Lord Hanuman' },
  baisakhi: { draw: baisakhi, viewBox: '0 0 220 220', label: 'Bhangra at the wheat harvest' },
  akshaya_tritiya: { draw: akshayaTritiya, viewBox: '0 0 220 220', label: "Gold and Goddess Lakshmi's footsteps" },
}

