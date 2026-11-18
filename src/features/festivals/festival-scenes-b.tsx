/**
 * Festival scenes, July to December (18 Nov 2026, the user's request: every
 * festival shows its deity or the people celebrating it, not just an emoji).
 */

import { along, Crown, Diya, Face, GoldDefs, Halo, HandLotus, Kalash, Kite, Marigolds, PeacockFeather, Rangoli, ring, Sparkle, Sun, Tiranga, Toran, type Draw } from './festival-art-kit'
import { Flame, Sugarcane } from './festival-scenes-a'

/* ===================== Guru Purnima: the guru's blessing under the full moon ===================== */

const guruPurnima: Draw = (id) => {
  const guru = '#e9b489'
  const pupil = '#f1c27d'
  return (
    <>
      <Halo id={id} cx={110} cy={110} r={108} inner="#f8fafc" outer="#a5b4fc" />
      <circle cx="132" cy="42" r="34" fill="#fefce8" opacity="0.35" />
      <circle cx="132" cy="42" r="24" fill="#fefce8" />
      <circle cx="124" cy="36" r="4" fill="#fef3c7" />
      <circle cx="140" cy="48" r="3" fill="#fef3c7" />
      <Sparkle x={30} y={30} r={2.6} fill="#ffffff" />
      <Sparkle x={196} y={24} r={2.4} fill="#ffffff" />
      <Sparkle x={182} y={70} r={2} fill="#ffffff" />
      {/* A branch above the guru's seat */}
      <path d="M0 26 Q40 34 74 16" stroke="#78350f" strokeWidth="4" fill="none" strokeLinecap="round" />
      {along(7, 0, 26, 40, 34, 74, 16).map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y + (i % 2 ? 6 : -5)} rx="4" ry="7" fill="#16a34a" transform={`rotate(${i % 2 ? 30 : -30} ${x} ${y})`} />
      ))}
      {/* The guru, seated */}
      <ellipse cx="80" cy="198" rx="50" ry="10" fill="#d6a35c" />
      <ellipse cx="80" cy="188" rx="38" ry="12" fill="#ea580c" />
      <path d="M56 186 Q54 142 80 134 Q106 142 104 186 Z" fill="#fb923c" />
      <path d="M92 138 Q106 144 104 164 L96 164 Z" fill={guru} />
      {along(13, 66, 140, 80, 186, 94, 140).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#7c2d12" />
      ))}
      <path d="M100 148 Q120 142 120 126" stroke={guru} strokeWidth="7" strokeLinecap="round" fill="none" />
      <ellipse cx="120" cy="121" rx="5" ry="7" fill={guru} />
      <circle cx="60" cy="182" r="5" fill={guru} />
      <rect x="76" y="124" width="8" height="10" fill={guru} />
      <circle cx="80" cy="88" r="7" fill="#e5e7eb" />
      <Face x={80} y={108} r={18} skin={guru} look="none" mark="tripundra" beard="#f1f5f9" earrings={false} />
      {/* A palm-leaf scripture by his side */}
      <g transform="rotate(-8 30 196)">
        <rect x="14" y="190" width="34" height="9" rx="2" fill="#d6a35c" stroke="#92400e" />
        <path d="M20 190 v9 M42 190 v9" stroke="#92400e" strokeWidth="1" />
      </g>
      {/* The disciple bowing with folded hands */}
      <path d="M140 202 Q162 190 186 202 Q162 208 140 202 Z" fill="#facc15" />
      <path d="M148 198 Q146 162 162 152 Q178 158 180 198 Z" fill={pupil} />
      <path d="M150 162 L176 192" stroke="#fde68a" strokeWidth="1.2" />
      <path d="M156 158 Q146 160 146 152" stroke={pupil} strokeWidth="6" strokeLinecap="round" fill="none" />
      <ellipse cx="144.5" cy="148" rx="2.4" ry="6.6" fill={pupil} stroke="#d4a373" strokeWidth="0.6" transform="rotate(-20 144.5 148)" />
      <ellipse cx="147" cy="149" rx="2.4" ry="6.6" fill={pupil} stroke="#d4a373" strokeWidth="0.6" transform="rotate(-20 147 149)" />
      <g transform="rotate(-14 162 134)">
        <Face x={162} y={134} r={14} skin={pupil} look="child" mark="tilak" earrings={false} />
      </g>
      {/* Flowers offered at his feet */}
      <ellipse cx="124" cy="206" rx="13" ry="3.6" fill="#fbbf24" stroke="#d97706" />
      {[
        [118, 203],
        [124, 202],
        [130, 203],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill={i % 2 ? '#f97316' : '#e11d48'} />
      ))}
    </>
  )
}

/* ===================== Independence Day: the flag over the Red Fort ===================== */

const independenceDay: Draw = (id) => (
  <>
    <Halo id={id} cx={110} cy={96} r={108} inner="#ffffff" outer="#86efac" />
    {/* Kites in the tricolour */}
    <path d="M40 86 Q30 140 0 170" stroke="#64748b" strokeWidth="0.6" fill="none" opacity="0.6" />
    <Kite x={40} y={70} s={0.85} a="#ff9933" b="#ffffff" rot={-14} />
    <path d="M186 106 Q196 150 220 172" stroke="#64748b" strokeWidth="0.6" fill="none" opacity="0.6" />
    <Kite x={186} y={92} s={0.75} a="#138808" b="#ffffff" rot={16} />
    {/* Doves */}
    {[
      [30, 30],
      [52, 22],
      [176, 30],
    ].map(([x, y], i) => (
      <path key={i} d={`M${x - 8} ${y} q4 -5 8 0 q4 -5 8 0`} stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
    ))}
    {/* The flag on its mast */}
    <path d="M110 140 V36" stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="110" cy="34" r="3" fill="#fbbf24" />
    <Tiranga x={111} y={38} w={66} />
    {/* The Red Fort */}
    <path d="M10 214 V172 H210 V214 Z" fill="#b91c1c" />
    {Array.from({ length: 20 }, (_, i) => (
      <rect key={i} x={12 + i * 10} y={166} width="6" height="7" fill="#b91c1c" />
    ))}
    <path d="M10 184 H210" stroke="#991b1b" strokeWidth="1" />
    <path d="M96 214 V190 Q110 174 124 190 V214 Z" fill="#7f1d1d" />
    <rect x="28" y="148" width="26" height="24" fill="#b91c1c" />
    <rect x="166" y="148" width="26" height="24" fill="#b91c1c" />
    <path d="M26 149 Q41 128 56 149 Z M164 149 Q179 128 194 149 Z" fill="#fef3c7" />
    <path d="M41 130 v-6 M179 130 v-6" stroke="#fbbf24" strokeWidth="1.6" />
    <rect x="88" y="154" width="44" height="18" fill="#b91c1c" />
    <path d="M86 155 Q110 128 134 155 Z" fill="#fef3c7" />
    {[30, 40, 168, 178, 92, 104, 116].map((x, i) => (
      <path key={i} d={`M${x} ${i < 4 ? 170 : 172} v-8 q3 -4 6 0 v8 Z`} fill="#7f1d1d" />
    ))}
    {[20, 70, 150, 200].map((x) => (
      <path key={x} d={`M${x - 4} 206 v-12 q4 -5 8 0 v12 Z`} fill="#7f1d1d" />
    ))}
    <Sparkle x={70} y={120} r={4} />
    <Sparkle x={156} y={124} r={4} />
  </>
)

/* ===================== Onam: King Mahabali and the pookalam ===================== */

const onam: Draw = (id) => {
  const skin = '#e9b489'
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={86} r={104} inner="#fffbe6" outer="#facc15" />
      <Rangoli cx={110} cy={204} r={74} squash={0.2} colors={['#f97316', '#facc15', '#dc2626', '#fde047', '#7c3aed']} />
      {/* The olakkuda, his palm-leaf umbrella */}
      <path d="M171 52 L156 150" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
      <path d="M136 56 Q170 16 206 52 Z" fill="#eab308" stroke="#a16207" />
      {[-0.8, -0.5, -0.2, 0.1, 0.4, 0.7].map((t) => (
        <path key={t} d={`M171 30 L${171 + t * 40} 54`} stroke="#a16207" strokeWidth="0.9" />
      ))}
      {[140, 152, 164, 176, 188, 200].map((x) => (
        <path key={x} d={`M${x} 54 v8`} stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      ))}
      {/* Body, kasavu mundu and gold */}
      <path d="M72 124 Q110 108 148 124 Q162 160 146 190 L74 190 Q58 160 72 124 Z" fill={skin} />
      <ellipse cx="110" cy="160" rx="24" ry="20" fill="#f5c79a" />
      <path d="M66 176 Q110 166 154 176 L158 216 L62 216 Z" fill="#fffbeb" />
      <path d="M66 178 Q110 168 154 178 M110 172 V216 M62 212 H158" stroke="#f59e0b" strokeWidth="4" fill="none" />
      <path d="M86 122 Q110 140 134 122" stroke="#fbbf24" strokeWidth="4" fill="none" />
      <path d="M82 124 Q110 158 138 124" stroke="#f59e0b" strokeWidth="3" fill="none" />
      {along(9, 84, 126, 110, 160, 136, 126).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill={i % 2 ? '#dc2626' : '#fbbf24'} />
      ))}
      {/* Blessing hand, and the hand on the umbrella */}
      <path d="M74 130 Q50 162 54 134" stroke={skin} strokeWidth="11" strokeLinecap="round" fill="none" />
      <ellipse cx="54" cy="126" rx="7" ry="9" fill={skin} />
      <path d="M50 118 v-4 M54 117 v-5 M58 118 v-4" stroke={skin} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M56 146 l8 -2" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M146 130 Q162 136 158 142" stroke={skin} strokeWidth="11" strokeLinecap="round" fill="none" />
      <ellipse cx="158" cy="142" rx="7" ry="6" fill={skin} />
      <rect x="104" y="100" width="12" height="12" fill={skin} />
      <Face x={110} y={82} r={22} skin={skin} look="man" earrings />
      <path d="M96 94 Q102 88 110 92 Q118 88 124 94 Q130 92 132 86 Q131 98 120 98 Q114 96 110 97 Q106 96 100 98 Q89 98 88 86 Q90 92 96 94 Z" fill="#111827" />
      <circle cx="88" cy="92" r="4.4" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      <circle cx="132" cy="92" r="4.4" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      <Crown id={id} cx={110} y={58} w={46} />
    </>
  )
}

/* ===================== Navratri: Maa Durga ===================== */

const durga: Draw = (id) => {
  const skin = '#f7c9a1'
  const arm = (d: string, key: string) => <path key={key} d={d} stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={88} r={106} inner="#fff1f2" outer="#ef4444" />
      <circle cx="110" cy="84" r="52" fill="none" stroke="#fca5a5" strokeWidth="2" strokeDasharray="3 5" />
      {/* Six arms behind, each with its weapon or gift */}
      {arm('M92 112 Q60 96 44 64', 'a1')}
      {arm('M92 116 Q56 112 30 104', 'a2')}
      {arm('M92 122 Q62 134 42 148', 'a3')}
      {arm('M128 112 Q160 96 176 64', 'a4')}
      {arm('M128 116 Q164 112 190 104', 'a5')}
      {arm('M128 122 Q158 134 178 148', 'a6')}
      {[
        [44, 64],
        [30, 104],
        [42, 148],
        [176, 64],
        [190, 104],
        [178, 148],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" fill={skin} />
      ))}
      <path d="M44 58 L32 22" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
      <path d="M38 60 L50 56" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 104 Q28 90 40 98 Q38 112 24 110 Z" fill="#fffbeb" stroke="#d6d3d1" />
      <path d="M26 102 q4 -4 8 0" stroke="#d6d3d1" fill="none" />
      <path d="M34 128 Q22 150 36 172" stroke="#92400e" strokeWidth="3" fill="none" />
      <path d="M34 128 L36 172" stroke="#fde68a" strokeWidth="0.8" />
      <circle cx="176" cy="54" r="11" fill="none" stroke="#fbbf24" strokeWidth="3" />
      {ring(8, 11, 176, 54).map(([x, y], i) => (
        <path key={i} d={`M176 54 L${x} ${y}`} stroke="#fbbf24" strokeWidth="1" />
      ))}
      {ring(8, 15, 176, 54).map(([x, y], i) => (
        <circle key={`f${i}`} cx={x} cy={y} r="1.6" fill="#f97316" />
      ))}
      <HandLotus x={192} y={98} s={1.1} />
      <path d="M178 148 L196 186" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />
      <circle cx="198" cy="190" r="7" fill={`url(#${id}gold)`} stroke="#b45309" />
      {/* Hair, red saree, golden blouse */}
      <path d="M86 76 Q72 120 64 140 L94 130 Q88 100 92 82 Z" fill="#1f2937" />
      <path d="M134 76 Q148 120 156 140 L126 130 Q132 100 128 82 Z" fill="#1f2937" />
      <path d="M72 128 Q110 120 148 128 L170 210 Q110 222 50 210 Z" fill="#dc2626" />
      <path d="M50 210 Q110 222 170 210" stroke="#fbbf24" strokeWidth="5" fill="none" />
      <path d="M58 198 Q110 210 162 198" stroke="#fde68a" strokeWidth="1.4" fill="none" strokeDasharray="3 3" />
      <path d="M92 102 Q110 96 128 102 L127 132 Q110 138 93 132 Z" fill="#facc15" />
      <path d="M124 102 Q140 130 128 166 L116 164 Q128 132 116 106 Z" fill="#ef4444" stroke="#fbbf24" strokeWidth="1.6" />
      {/* The trishul in one front hand, the other raised in blessing */}
      <path d="M70 36 V214" stroke="#cbd5e1" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M58 36 Q58 22 64 14 M82 36 Q82 22 76 14 M58 36 H82" stroke="#e2e8f0" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M70 36 V8" stroke="#e2e8f0" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M66 10 L70 0 L74 10 Z M60 16 L63 7 L67 15 Z M80 16 L77 7 L73 15 Z" fill="#f1f5f9" />
      <path d="M90 118 Q72 132 72 148" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <ellipse cx="72" cy="150" rx="6" ry="7" fill={skin} />
      <path d="M130 118 Q156 162 152 138" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <ellipse cx="152" cy="131" rx="6.4" ry="9" fill={skin} />
      <circle cx="152" cy="133" r="1.8" fill="#dc2626" />
      <path d="M68 140 l8 0 M148 148 l8 -1" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <rect x="105" y="92" width="10" height="12" fill={skin} />
      <path d="M96 102 Q110 116 124 102" stroke="#fbbf24" strokeWidth="3" fill="none" />
      <path d="M94 104 Q110 126 126 104" stroke="#f59e0b" strokeWidth="2.4" fill="none" />
      <circle cx="110" cy="118" r="3.2" fill="#dc2626" stroke="#fbbf24" />
      <Face x={110} y={76} r={22} skin={skin} mark="bindi" back={false} />
      <path d="M110 62 v5" stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="104" cy="86" r="2.2" fill="none" stroke="#f59e0b" strokeWidth="0.9" />
      <Crown id={id} cx={110} y={52} w={40} />
      {/* Her lion */}
      <g>
        {ring(16, 24, 178, 196).map(([x, y], i) => (
          <path key={i} d={`M178 196 L${x} ${y}`} stroke="#b45309" strokeWidth="9" strokeLinecap="round" />
        ))}
        <circle cx="178" cy="196" r="22" fill="#d97706" />
        <circle cx="178" cy="198" r="15" fill="#fbbf24" />
        <circle cx="166" cy="184" r="4" fill="#fbbf24" />
        <circle cx="190" cy="184" r="4" fill="#fbbf24" />
        <circle cx="172" cy="194" r="1.8" fill="#1f2937" />
        <circle cx="184" cy="194" r="1.8" fill="#1f2937" />
        <path d="M175 200 L181 200 L178 204 Z" fill="#7c2d12" />
        <path d="M178 204 q-4 4 -8 2 M178 204 q4 4 8 2" stroke="#7c2d12" strokeWidth="1.2" fill="none" />
      </g>
    </>
  )
}

/* ===================== Dussehra: Ravana's effigy and Rama's arrow ===================== */

const dussehra: Draw = (id) => {
  const face = '#fde68a'
  const heads = Array.from({ length: 10 }, (_, k) => 104 + (k - 4.5) * 18)
  // Outer heads first, so the ones in the middle sit in front.
  const order = [...heads].sort((a, b) => Math.abs(b - 104) - Math.abs(a - 104))
  return (
    <>
      <Halo id={id} cx={110} cy={110} r={108} inner="#fff7ed" outer="#f97316" />
      {/* Fireworks */}
      {[
        [32, 38, '#facc15'],
        [192, 34, '#f472b6'],
      ].map(([x, y, c], i) => (
        <g key={i}>
          {ring(12, 14, x as number, y as number).map(([px, py], j) => (
            <path key={j} d={`M${x} ${y} L${px} ${py}`} stroke={c as string} strokeWidth="1.6" strokeLinecap="round" />
          ))}
          <circle cx={x as number} cy={y as number} r="2.4" fill="#ffffff" />
        </g>
      ))}
      {/* The effigy: skirt, tunic, arms and sword */}
      <path d="M72 212 L84 150 L124 150 L136 212 Z" fill="#7c3aed" />
      <path d="M78 196 L88 184 L98 196 L108 184 L118 196 L128 184 L134 196" stroke="#facc15" strokeWidth="1.6" fill="none" />
      <path d="M78 154 L82 106 Q104 96 126 106 L130 154 Z" fill="#dc2626" />
      {[118, 132].map((y) => (
        <path key={y} d={`M86 ${y} L94 ${y - 6} L102 ${y} L110 ${y - 6} L118 ${y} L126 ${y - 6}`} stroke="#fde68a" strokeWidth="1.4" fill="none" />
      ))}
      <rect x="80" y="146" width="48" height="6" fill="#fbbf24" />
      <path d="M82 112 Q60 118 46 134" stroke="#ca8a04" strokeWidth="10" strokeLinecap="round" fill="none" />
      <circle cx="44" cy="136" r="6" fill={face} />
      <path d="M126 112 Q150 118 162 132" stroke="#ca8a04" strokeWidth="10" strokeLinecap="round" fill="none" />
      <circle cx="164" cy="134" r="6" fill={face} />
      <path d="M166 130 L190 86" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
      <path d="M160 128 L170 134" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
      {/* Ten heads, each crowned */}
      {order.map((x) => {
        const middle = Math.abs(x - 104) < 10
        const r = middle ? 14 : 11.5
        const y = middle ? 80 : 84
        return (
          <g key={x}>
            <path d={`M${x - r * 0.8} ${y - r * 0.7} L${x - r * 0.5} ${y - r * 1.7} L${x} ${y - r * 1.05} L${x + r * 0.5} ${y - r * 1.7} L${x + r * 0.8} ${y - r * 0.7} Z`} fill="#fbbf24" stroke="#b45309" strokeWidth="0.6" />
            <circle cx={x} cy={y} r={r} fill={face} stroke="#b45309" strokeWidth="0.8" />
            <circle cx={x - r * 0.38} cy={y - r * 0.15} r={r * 0.2} fill="#ffffff" />
            <circle cx={x + r * 0.38} cy={y - r * 0.15} r={r * 0.2} fill="#ffffff" />
            <circle cx={x - r * 0.38} cy={y - r * 0.15} r={r * 0.1} fill="#111827" />
            <circle cx={x + r * 0.38} cy={y - r * 0.15} r={r * 0.1} fill="#111827" />
            <path d={`M${x - r * 0.6} ${y + r * 0.35} Q${x} ${y + r * 0.05} ${x + r * 0.6} ${y + r * 0.35} Q${x} ${y + r * 0.25} ${x - r * 0.6} ${y + r * 0.35} Z`} fill="#111827" />
            <circle cx={x} cy={y - r * 0.55} r={r * 0.1} fill="#dc2626" />
          </g>
        )
      })}
      {/* The arrow, with fire at its tip */}
      <path d="M214 56 L132 120" stroke="#78350f" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M128 124 L138 112 L142 120 Z" fill="#fbbf24" />
      <path d="M214 56 l-10 -2 M214 56 l-2 10 M208 61 l-10 -2 M208 61 l-2 10" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      <Flame x={134} y={124} s={0.6} />
      {/* Burning at the base */}
      <Flame x={82} y={218} s={1.1} />
      <Flame x={104} y={219} s={1.5} />
      <Flame x={126} y={218} s={1.1} />
      <Sparkle x={150} y={150} r={4} />
      <Sparkle x={60} y={170} r={3.4} />
    </>
  )
}

/* ===================== Karwa Chauth: the moon through the sieve ===================== */

const karwaChauth: Draw = (id) => {
  const skin = '#f8c8a0'
  return (
    <>
      <Halo id={id} cx={110} cy={110} r={108} inner="#eef2ff" outer="#6366f1" />
      <circle cx="172" cy="40" r="28" fill="#fef9c3" opacity="0.35" />
      <circle cx="172" cy="40" r="20" fill="#fef9c3" />
      {[
        [30, 30],
        [60, 16],
        [120, 22],
        [204, 86],
        [24, 100],
      ].map(([x, y], i) => (
        <Sparkle key={i} x={x} y={y} r={2.6} fill="#ffffff" />
      ))}
      {/* The veil behind her head */}
      <path d="M64 72 Q92 34 120 72 L126 132 Q92 124 58 132 Z" fill="#ef4444" stroke="#fbbf24" strokeWidth="2" />
      {/* Red lehenga and blouse */}
      <path d="M54 214 L70 146 L114 146 L130 214 Q92 222 54 214 Z" fill="#dc2626" />
      <path d="M54 214 Q92 222 130 214" stroke="#fbbf24" strokeWidth="4" fill="none" />
      <path d="M60 196 Q92 204 124 196" stroke="#fde68a" strokeWidth="1.2" fill="none" strokeDasharray="2 3" />
      <path d="M70 116 Q92 106 114 116 L114 148 L70 148 Z" fill="#f59e0b" />
      <path d="M112 112 L74 152" stroke="#ef4444" strokeWidth="8" opacity="0.9" strokeLinecap="round" />
      {/* The thali: diya, karwa and sweets */}
      <path d="M72 120 Q54 132 52 146" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
      <ellipse cx="44" cy="150" rx="22" ry="5.4" fill="#fbbf24" stroke="#d97706" />
      <Diya x={30} y={150} s={0.55} />
      <circle cx="52" cy="141" r="7" fill="#b45309" />
      <path d="M58 138 L66 132" stroke="#b45309" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M46 136 Q52 132 58 136" stroke="#fbbf24" strokeWidth="1.2" fill="none" />
      <circle cx="40" cy="147" r="2.2" fill="#fde68a" />
      <path d="M48 154 l3 2 M52 153 l3 2" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      {/* Her face, the sindoor, the tikka */}
      <rect x="88" y="98" width="8" height="10" fill={skin} />
      <Face x={92} y={82} r={19} skin={skin} mark="bindi" />
      <path d="M70 74 Q92 52 114 74" stroke="#fbbf24" strokeWidth="3" fill="none" />
      <path d="M92 60 V68" stroke="#dc2626" strokeWidth="1.6" />
      <circle cx="92" cy="70" r="2" fill="#fbbf24" />
      <circle cx="99" cy="89" r="2.4" fill="none" stroke="#fbbf24" strokeWidth="1" />
      {/* The sieve she looks at the moon through */}
      <path d="M112 120 Q140 112 138 92" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="132" cy="74" r="17" fill="#fde68a" opacity="0.55" />
      <circle cx="132" cy="74" r="17" fill="none" stroke="#b45309" strokeWidth="3" />
      {[-10, -5, 0, 5, 10].map((d) => (
        <path key={`h${d}`} d={`M${132 - Math.sqrt(256 - d * d)} ${74 + d} H${132 + Math.sqrt(256 - d * d)}`} stroke="#d97706" strokeWidth="0.6" />
      ))}
      {[-10, -5, 0, 5, 10].map((d) => (
        <path key={`v${d}`} d={`M${132 + d} ${74 - Math.sqrt(256 - d * d)} V${74 + Math.sqrt(256 - d * d)}`} stroke="#d97706" strokeWidth="0.6" />
      ))}
      <circle cx="138" cy="92" r="4.4" fill={skin} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={137 + i * 1.4} cy={92 - i * 1.4} r="0.6" fill="#9a3412" />
      ))}
      <path d="M128 102 l6 -4 M52 140 l0 0" stroke="#dc2626" strokeWidth="2.6" strokeLinecap="round" />
    </>
  )
}

/* ===================== Dhanteras: Lord Dhanvantari with the nectar ===================== */

const dhanvantari: Draw = (id) => {
  const skin = '#f7c9a1'
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={80} r={98} inner="#fffbe6" outer="#f59e0b" />
      {/* Upper hands: the conch and the chakra */}
      <path d="M92 108 Q68 100 58 80" stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M128 108 Q152 100 162 80" stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
      <ellipse cx="58" cy="78" rx="5" ry="6" fill={skin} />
      <ellipse cx="162" cy="78" rx="5" ry="6" fill={skin} />
      <path d="M44 66 Q52 50 66 58 Q64 72 50 72 Z" fill="#fffbeb" stroke="#d6d3d1" />
      <path d="M50 64 q4 -4 8 0" stroke="#d6d3d1" fill="none" />
      <circle cx="166" cy="62" r="11" fill="none" stroke="#fbbf24" strokeWidth="3" />
      {ring(8, 11, 166, 62).map(([x, y], i) => (
        <path key={i} d={`M166 62 L${x} ${y}`} stroke="#fbbf24" strokeWidth="1" />
      ))}
      {/* Hair, pitambar, body */}
      <path d="M88 72 Q84 104 80 118 L98 116 Q94 96 96 78 Z" fill="#1f2937" />
      <path d="M132 72 Q136 104 140 118 L122 116 Q126 96 124 78 Z" fill="#1f2937" />
      <path d="M72 132 Q110 122 148 132 L174 200 Q110 216 46 200 Z" fill="#facc15" />
      <path d="M46 200 Q110 216 174 200" stroke="#dc2626" strokeWidth="4" fill="none" />
      <path d="M80 104 Q110 96 140 104 L142 138 L78 138 Z" fill={skin} />
      <path d="M84 104 L128 138" stroke="#fde68a" strokeWidth="1.4" />
      {along(11, 84, 106, 110, 150, 136, 106).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.8" fill={i % 2 ? '#fde047' : '#f97316'} />
      ))}
      {/* Both front hands holding the kalash of amrit */}
      <path d="M82 112 Q70 138 90 152" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M138 112 Q150 138 130 152" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="110" cy="128" r="16" fill="#fef9c3" opacity="0.7" />
      <path d="M90 170 Q80 152 94 138 L126 138 Q140 152 130 170 Q110 178 90 170 Z" fill={`url(#${id}gold)`} stroke="#b45309" />
      <rect x="100" y="130" width="20" height="9" rx="2" fill="#d97706" />
      <ellipse cx="110" cy="130" rx="13" ry="3.4" fill="#fbbf24" />
      <path d="M106 154 h8 M110 150 v8 M106 154 v-4 M114 154 v4 M110 150 h4 M110 158 h-4" stroke="#dc2626" strokeWidth="1.4" />
      <ellipse cx="90" cy="152" rx="6" ry="5" fill={skin} />
      <ellipse cx="130" cy="152" rx="6" ry="5" fill={skin} />
      <Sparkle x={104} y={118} r={4} fill="#ffffff" />
      <Sparkle x={118} y={112} r={3} fill="#ffffff" />
      <rect x="105" y="90" width="10" height="12" fill={skin} />
      <path d="M96 100 Q110 112 124 100" stroke="#fbbf24" strokeWidth="2.6" fill="none" />
      <Face x={110} y={72} r={22} skin={skin} look="man" mark="tilak" earrings />
      <Crown id={id} cx={110} y={48} w={40} />
      {/* Gold coins, a new brass pot and lamps */}
      {[
        [26, 208],
        [36, 204],
        [30, 198],
        [42, 210],
        [22, 200],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="7" ry="3.2" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      ))}
      <circle cx="190" cy="198" r="13" fill={`url(#${id}gold)`} stroke="#b45309" />
      <rect x="183" y="180" width="14" height="7" rx="2" fill="#d97706" />
      <ellipse cx="190" cy="180" rx="10" ry="3" fill="#fbbf24" />
      <Diya x={70} y={214} s={0.9} />
      <Diya x={146} y={214} s={0.9} />
    </>
  )
}

/* ===================== Kali Chaudas: Maa Kali ===================== */

const kali: Draw = (id) => {
  const skin = '#3b4f9e'
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={90} r={106} inner="#fff1f2" outer="#dc2626" />
      {/* Her flowing hair */}
      <path d="M110 40 Q60 40 52 92 Q40 120 30 150 Q48 140 56 156 Q60 132 74 140 Q74 112 86 100 L134 100 Q146 112 146 140 Q160 132 164 156 Q172 140 190 150 Q180 120 168 92 Q160 40 110 40 Z" fill="#111827" />
      <path d="M54 110 Q44 128 38 146 M166 110 Q176 128 182 146 M64 120 Q58 136 56 150 M156 120 Q162 136 164 150" stroke="#374151" strokeWidth="1.4" fill="none" />
      {/* Skirt, body and the hibiscus garland */}
      <path d="M66 176 Q110 166 154 176 L160 216 L60 216 Z" fill="#b91c1c" />
      <path d="M66 176 Q110 166 154 176 M60 214 H160" stroke="#fbbf24" strokeWidth="3" fill="none" />
      <path d="M78 120 Q110 108 142 120 L146 180 L74 180 Z" fill={skin} />
      {along(11, 80, 120, 110, 186, 140, 120).map(([x, y], i) => (
        <g key={i}>
          {ring(5, 3, x, y).map(([px, py], j) => (
            <circle key={j} cx={px} cy={py} r="2.4" fill="#dc2626" />
          ))}
          <circle cx={x} cy={y} r="1.3" fill="#facc15" />
        </g>
      ))}
      {/* The sword raised, blessing hands, a lamp */}
      <path d="M80 124 Q56 104 54 78" stroke={skin} strokeWidth="10" strokeLinecap="round" fill="none" />
      <ellipse cx="54" cy="74" rx="6" ry="7" fill={skin} />
      <path d="M54 70 Q46 40 62 16 Q60 44 58 70 Z" fill="#e2e8f0" stroke="#94a3b8" />
      <path d="M48 70 H62" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
      <path d="M140 124 Q166 158 162 130" stroke={skin} strokeWidth="10" strokeLinecap="round" fill="none" />
      <ellipse cx="162" cy="122" rx="7" ry="9" fill={skin} />
      <circle cx="162" cy="124" r="1.8" fill="#dc2626" />
      <path d="M78 140 Q58 152 58 166" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <Diya x={58} y={176} s={0.75} />
      <path d="M142 140 Q162 152 160 168" stroke={skin} strokeWidth="9" strokeLinecap="round" fill="none" />
      <ellipse cx="160" cy="172" rx="6" ry="7" fill={skin} />
      <path d="M56 98 l8 -3 M150 148 l8 1" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
      {/* Her face: the third eye and the tongue */}
      <rect x="104" y="98" width="12" height="12" fill={skin} />
      <path d="M92 108 Q110 122 128 108" stroke="#fbbf24" strokeWidth="3" fill="none" />
      <Face x={110} y={82} r={22} skin={skin} look="none" lips="#991b1b" earrings />
      <path d="M106 94 Q110 110 114 94 Z" fill="#dc2626" />
      <path d="M110 64 q2.6 3.4 0 7 q-2.6 -3.6 0 -7 Z" fill="#f8fafc" stroke="#dc2626" strokeWidth="0.8" />
      <Crown id={id} cx={110} y={56} w={40} />
      <Diya x={30} y={214} s={1.1} />
      <Diya x={176} y={214} s={1.1} />
    </>
  )
}

/* ===================== Nutan Varsh: Krishna lifting Govardhan ===================== */

const govardhan: Draw = (id) => {
  const skin = '#6fa8f2'
  return (
    <>
      <Halo id={id} cx={110} cy={112} r={108} inner="#f0f9ff" outer="#38bdf8" />
      {/* Indra's rain at the sides, kept off by the hill */}
      {Array.from({ length: 14 }, (_, i) => {
        const x = i < 7 ? 6 + i * 6 : 172 + (i - 7) * 6
        const y = 30 + ((i * 17) % 50)
        return <path key={i} d={`M${x} ${y} l-4 12 M${x + 2} ${y + 34} l-4 12`} stroke="#93c5fd" strokeWidth="1.4" strokeLinecap="round" />
      })}
      {[
        [30, 18],
        [190, 16],
      ].map(([x, y], i) => (
        <g key={i} fill="#94a3b8">
          <circle cx={x - 12} cy={y + 4} r="9" />
          <circle cx={x} cy={y} r="12" />
          <circle cx={x + 13} cy={y + 4} r="9" />
        </g>
      ))}
      {/* Govardhan, on his little finger */}
      <path d="M24 78 Q38 42 68 48 Q88 18 120 32 Q150 16 172 46 Q200 48 198 78 Q110 96 24 78 Z" fill="#65a30d" stroke="#3f6212" />
      <path d="M24 78 Q110 96 198 78 Q110 104 24 78 Z" fill="#78350f" />
      {[
        [56, 58],
        [84, 44],
        [118, 40],
        [150, 44],
        [176, 62],
        [100, 62],
        [136, 64],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y + 8} v-5`} stroke="#78350f" strokeWidth="1.4" />
          <circle cx={x} cy={y} r="5" fill="#16a34a" />
        </g>
      ))}
      <path d="M120 126 Q128 104 116 92" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M116 92 L115 87" stroke={skin} strokeWidth="2.6" strokeLinecap="round" />
      {/* Krishna */}
      <path d="M90 206 L95 150 L125 150 L130 206 Q110 212 90 206 Z" fill="#facc15" />
      <path d="M90 206 Q110 212 130 206" stroke="#dc2626" strokeWidth="3" fill="none" />
      <path d="M96 124 Q110 116 124 124 L125 152 L95 152 Z" fill={skin} />
      {along(9, 98, 124, 110, 160, 122, 124).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill={i % 2 ? '#fde047' : '#ef4444'} />
      ))}
      <path d="M98 128 Q84 140 88 152" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="88" cy="154" r="4" fill={skin} />
      <path d="M76 166 L100 144" stroke="#92400e" strokeWidth="3.4" strokeLinecap="round" />
      <PeacockFeather x={122} y={94} rot={40} s={0.5} />
      <rect x="106" y="114" width="8" height="10" fill={skin} />
      <Face x={110} y={106} r={14} skin={skin} look="man" mark="tilak" earrings lips="#1e3a8a" />
      {/* A cow and her calf in its shelter */}
      <g>
        <ellipse cx="46" cy="188" rx="22" ry="12" fill="#ffffff" stroke="#d6d3d1" />
        <ellipse cx="40" cy="184" rx="7" ry="5" fill="#a16207" opacity="0.7" />
        <path d="M30 196 v14 M38 198 v12 M56 198 v12 M62 196 v14" stroke="#d6d3d1" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="72" cy="178" rx="8" ry="10" fill="#ffffff" stroke="#d6d3d1" />
        <path d="M66 170 q-4 -6 -2 -10 M78 170 q4 -6 2 -10" stroke="#a16207" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="69" cy="176" r="1.2" fill="#111827" />
        <circle cx="75" cy="176" r="1.2" fill="#111827" />
        <ellipse cx="72" cy="185" rx="4" ry="2.6" fill="#fda4af" />
        <path d="M24 186 q-6 6 -4 14" stroke="#d6d3d1" strokeWidth="2" fill="none" />
      </g>
      <g>
        <ellipse cx="172" cy="196" rx="15" ry="8" fill="#fef3c7" stroke="#d6d3d1" />
        <path d="M162 202 v10 M168 203 v9 M178 203 v9 M184 202 v10" stroke="#d6d3d1" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="156" cy="188" rx="6" ry="7" fill="#fef3c7" stroke="#d6d3d1" />
        <circle cx="154" cy="186" r="1" fill="#111827" />
      </g>
    </>
  )
}

/* ===================== Bhai Dooj: the sister's tilak ===================== */

const bhaiDooj: Draw = (id) => {
  const her = '#f8c8a0'
  const him = '#e9b489'
  return (
    <>
      <Halo id={id} cx={110} cy={100} r={108} inner="#fff1f5" outer="#f472b6" />
      <Rangoli cx={110} cy={208} r={52} squash={0.18} />
      {/* The brother, seated on a low stool */}
      <rect x="120" y="198" width="62" height="6" rx="1.5" fill="#92400e" />
      <path d="M124 204 v10 M178 204 v10" stroke="#78350f" strokeWidth="3" />
      <ellipse cx="151" cy="192" rx="30" ry="9" fill="#f8fafc" stroke="#e2e8f0" />
      <path d="M131 192 L135 146 Q151 138 167 146 L171 192 Z" fill="#0ea5e9" />
      <path d="M151 142 V176" stroke="#0369a1" strokeWidth="1.2" />
      {[150, 160, 170].map((y) => (
        <circle key={y} cx="151" cy={y} r="1.3" fill="#fbbf24" />
      ))}
      <path d="M136 152 Q128 172 140 184" stroke={him} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M166 152 Q174 172 162 184" stroke={him} strokeWidth="6" strokeLinecap="round" fill="none" />
      <rect x="147" y="132" width="8" height="10" fill={him} />
      <Face x={151} y={122} r={16} skin={him} look="man" earrings={false} lips="#9f1239" />
      <path d="M133 120 Q134 101 151 99 Q168 101 169 120 Q151 110 133 120 Z" fill="#f97316" />
      <path d="M135 118 l-4 8 M167 118 l4 8" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M151 108 v6" stroke="#dc2626" strokeWidth="2.6" strokeLinecap="round" />
      {[-2, 0, 2].map((d) => (
        <circle key={d} cx={151 + d} cy={116} r="0.7" fill="#fffbeb" />
      ))}
      {/* A gift beside him */}
      <rect x="182" y="184" width="22" height="18" rx="2" fill="#a855f7" />
      <path d="M193 184 V202 M182 193 H204" stroke="#fde047" strokeWidth="2.4" />
      <path d="M193 184 q-6 -8 -10 -2 M193 184 q6 -8 10 -2" stroke="#fde047" strokeWidth="2" fill="none" />
      {/* The sister with her aarti thali */}
      <path d="M44 208 L58 150 L90 150 L104 208 Q74 216 44 208 Z" fill="#a855f7" />
      <path d="M44 208 Q74 216 104 208" stroke="#fbbf24" strokeWidth="4" fill="none" />
      <path d="M58 120 Q74 112 90 120 L90 152 L58 152 Z" fill="#f472b6" />
      <path d="M90 118 L58 154" stroke="#facc15" strokeWidth="7" strokeLinecap="round" opacity="0.9" />
      <path d="M60 124 Q46 134 48 144" stroke={her} strokeWidth="6" strokeLinecap="round" fill="none" />
      <ellipse cx="42" cy="148" rx="18" ry="5" fill="#fbbf24" stroke="#d97706" />
      <Diya x={30} y={148} s={0.5} />
      <circle cx="46" cy="145" r="3" fill="#dc2626" />
      {[
        [52, 145],
        [55, 147],
        [50, 148],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="#fffbeb" />
      ))}
      <path d="M88 124 Q118 116 146 111" stroke={her} strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="148" cy="111" r="2.6" fill={her} />
      <rect x="70" y="102" width="8" height="10" fill={her} />
      <Face x={74} y={88} r={18} skin={her} mark="bindi" />
      <circle cx="90" cy="72" r="3.6" fill="#ef4444" />
      <path d="M118 52 C118 46 110 44 110 51 C110 56 118 60 118 62 C118 60 126 56 126 51 C126 44 118 46 118 52 Z" fill="#f472b6" />
      <Sparkle x={104} y={78} r={3.6} />
      <Sparkle x={182} y={92} r={3.6} />
    </>
  )
}

/* ===================== Labh Pancham: the new account book ===================== */

const labhPancham: Draw = (id) => (
  <>
    <GoldDefs id={id} />
    <Halo id={id} cx={110} cy={112} r={108} inner="#fffbe6" outer="#dc2626" />
    <Toran x0={6} x1={214} y={16} sag={8} />
    {/* A low table under red cloth */}
    <path d="M34 196 h152 v10 h-152 Z" fill="#7f1d1d" />
    <path d="M24 178 L196 178 L188 198 L32 198 Z" fill="#dc2626" />
    <path d="M24 178 L196 178" stroke="#fbbf24" strokeWidth="3" />
    <path d="M32 198 L188 198" stroke="#fbbf24" strokeWidth="2" strokeDasharray="3 3" />
    {/* The chopda, open at its first page */}
    <path d="M56 176 L110 182 L164 176 L164 112 L110 118 L56 112 Z" fill="#b91c1c" />
    <path d="M62 172 Q86 164 108 172 L108 112 Q86 104 62 112 Z" fill="#fffbeb" stroke="#b91c1c" strokeWidth="0.8" />
    <path d="M112 172 Q134 164 158 172 L158 112 Q134 104 112 112 Z" fill="#fffbeb" stroke="#b91c1c" strokeWidth="0.8" />
    <g stroke="#dc2626" strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M85 126 V156 M70 141 H100" />
      <path d="M85 126 H98 M100 141 V154 M85 156 H72 M70 141 V128" />
    </g>
    {[
      [77, 133],
      [93, 133],
      [77, 149],
      [93, 149],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="2" fill="#dc2626" />
    ))}
    <text x="135" y="134" textAnchor="middle" fontSize="15" fontWeight="700" fill="#b91c1c" fontFamily="'Nirmala UI', Mangal, sans-serif">
      शुभ
    </text>
    <text x="135" y="158" textAnchor="middle" fontSize="15" fontWeight="700" fill="#b91c1c" fontFamily="'Nirmala UI', Mangal, sans-serif">
      लाभ
    </text>
    <path d="M110 118 V182" stroke="#991b1b" strokeWidth="1.2" />
    {/* Kalash, lamp and coins */}
    <Kalash x={38} y={178} s={0.9} />
    <Diya x={176} y={176} s={1} />
    {[
      [184, 170],
      [194, 174],
      [190, 166],
    ].map(([x, y], i) => (
      <ellipse key={i} cx={x} cy={y} rx="6" ry="2.8" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
    ))}
    <Sparkle x={70} y={70} r={5} />
    <Sparkle x={150} y={66} r={5} />
    <Sparkle x={110} y={86} r={4} />
  </>
)

/* ===================== Chhath Puja: arghya to the setting sun ===================== */

const chhath: Draw = (id) => {
  const skin = '#e9b489'
  return (
    <>
      <defs>
        <linearGradient id={`${id}water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <Halo id={id} cx={60} cy={110} r={104} inner="#fff7ed" outer="#fb923c" />
      <Sun cx={56} cy={136} r={26} color="#f97316" ray="#fdba74" />
      <Sugarcane x={196} top={70} lean={-6} />
      <Sugarcane x={208} top={84} lean={-10} />
      {/* The woman in her yellow saree, in the river up to her waist */}
      <path d="M118 216 L124 160 L160 160 L166 216 Z" fill="#facc15" />
      <path d="M124 128 Q142 120 160 128 L160 162 L124 162 Z" fill="#facc15" />
      <path d="M158 126 L128 166" stroke="#f97316" strokeWidth="8" strokeLinecap="round" />
      <path d="M118 94 Q142 62 166 94 L170 140 Q142 132 114 140 Z" fill="#f97316" stroke="#dc2626" strokeWidth="1.6" />
      {/* The water over the setting sun and her */}
      <path d="M4 150 Q110 140 216 150 Q218 198 194 210 Q110 226 26 210 Q2 198 4 150 Z" fill={`url(#${id}water)`} />
      {[
        [56, 158, 30],
        [56, 168, 22],
        [56, 178, 14],
      ].map(([x, y, w], i) => (
        <path key={i} d={`M${x - w} ${y} H${x + w}`} stroke="#fde68a" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
      ))}
      <path d="M116 168 Q142 162 168 168 M110 178 Q142 172 174 178" stroke="#e0f2fe" strokeWidth="1.4" fill="none" opacity="0.8" />
      {/* Arms holding up the soop with fruit and a lamp */}
      <path d="M126 134 Q108 134 104 124" stroke={skin} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M158 134 Q132 142 112 128" stroke={skin} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M68 114 Q82 96 112 104 L116 128 Q90 134 68 114 Z" fill="#d6a35c" stroke="#a16207" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${74 + i * 10} ${110 - i * 2} L${80 + i * 10} ${128 - i}`} stroke="#a16207" strokeWidth="0.8" />
      ))}
      <path d="M84 104 q6 -10 16 -6" stroke="#facc15" strokeWidth="4.6" fill="none" strokeLinecap="round" />
      <circle cx="102" cy="108" r="5.4" fill="#92400e" />
      <circle cx="90" cy="112" r="4" fill="#dc2626" />
      <ellipse cx="78" cy="114" rx="4.4" ry="3" fill="#b45309" />
      <Diya x={96} y={122} s={0.45} />
      <rect x="138" y="110" width="8" height="10" fill={skin} />
      <Face x={142} y={98} r={16} skin={skin} mark="bindi" />
      <path d="M124 92 Q142 74 160 92" stroke="#dc2626" strokeWidth="2.4" fill="none" />
      <path d="M142 80 V86" stroke="#dc2626" strokeWidth="1.6" />
      {[
        [30, 40],
        [44, 32],
        [150, 30],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x - 6} ${y} q3 -4 6 0 q3 -4 6 0`} stroke="#7c2d12" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      ))}
    </>
  )
}

/* ===================== Tulsi Vivah: Tulsi as a bride, wed to Shaligram ===================== */

const tulsiVivah: Draw = (id) => {
  // A full, bushy tulsi: clusters of paired leaves from the pot up to the crown.
  const leaves = [
    [98, 60], [90, 66], [106, 66], [84, 74], [98, 72], [112, 74],
    [76, 84], [90, 82], [106, 82], [120, 84], [70, 96], [84, 94],
    [112, 94], [126, 96], [74, 108], [88, 106], [108, 106], [122, 108],
    [80, 120], [94, 118], [104, 120], [116, 120],
  ]
  return (
    <>
      <GoldDefs id={id} />
      <Halo id={id} cx={110} cy={100} r={108} inner="#fffbe6" outer="#22c55e" />
      {/* The sugarcane mandap */}
      <Sugarcane x={24} top={42} lean={44} />
      <Sugarcane x={42} top={50} lean={30} />
      <Sugarcane x={196} top={42} lean={-44} />
      <Sugarcane x={178} top={50} lean={-30} />
      <Marigolds x0={58} y0={46} cx={110} cy={74} x1={162} y1={46} n={15} r={3.6} />
      <Toran x0={62} x1={158} y={40} sag={4} />
      <Rangoli cx={110} cy={208} r={62} squash={0.18} />
      {/* The vrindavan */}
      <path d="M70 202 L74 142 L122 142 L126 202 Z" fill="#f97316" />
      <rect x="66" y="134" width="64" height="10" rx="2" fill="#ea580c" />
      <path d="M74 150 H122 M74 194 H126" stroke="#fff7ed" strokeWidth="1.6" strokeDasharray="2 3" />
      <path d="M90 198 V178 Q98 168 106 178 V198 Z" fill="#7c2d12" />
      <path d="M98 188 C96 185 97 182 98 179 C99 182 100 185 98 188 Z" fill="#fde047" />
      <path d="M94 160 h8 M98 156 v8 M94 160 v-4 M102 160 v4 M98 156 h4 M98 164 h-4" stroke="#dc2626" strokeWidth="1.4" />
      {/* Tulsi, dressed as the bride */}
      <path d="M98 134 V62 M98 118 L76 104 M98 112 L122 100 M98 96 L80 82 M98 90 L116 78" stroke="#3f6212" strokeWidth="2" />
      {leaves.map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x - 3} cy={y} rx="3" ry="5" fill="#16a34a" transform={`rotate(-30 ${x - 3} ${y})`} />
          <ellipse cx={x + 3} cy={y} rx="3" ry="5" fill="#15803d" transform={`rotate(30 ${x + 3} ${y})`} />
        </g>
      ))}
      {/* Her red chunri, draped over the crown like a bride's veil */}
      <path d="M84 78 Q98 58 112 78 L118 104 Q108 96 98 100 Q88 96 78 104 Z" fill="#dc2626" opacity="0.9" />
      <path d="M78 104 Q88 96 98 100 Q108 96 118 104" stroke="#fbbf24" strokeWidth="2.4" fill="none" />
      <path d="M84 78 Q98 58 112 78" stroke="#fbbf24" strokeWidth="1.4" fill="none" />
      {[
        [90, 86],
        [98, 80],
        [106, 86],
        [94, 94],
        [102, 94],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.2" fill="#fde047" />
      ))}
      {[
        [98, 58],
        [92, 62],
        [104, 62],
      ].map(([x, y], i) => (
        <g key={`t${i}`}>
          <ellipse cx={x - 2.6} cy={y} rx="2.6" ry="4.4" fill="#16a34a" transform={`rotate(-30 ${x - 2.6} ${y})`} />
          <ellipse cx={x + 2.6} cy={y} rx="2.6" ry="4.4" fill="#15803d" transform={`rotate(30 ${x + 2.6} ${y})`} />
        </g>
      ))}
      {/* Mangalsutra and green bangles */}
      <path d="M86 106 Q98 118 110 106" stroke="#111827" strokeWidth="1.4" fill="none" strokeDasharray="1 1.4" />
      <circle cx="98" cy="113" r="2.2" fill="#fbbf24" />
      {[0, 1, 2].map((i) => (
        <ellipse key={`b${i}`} cx={128 + i * 2} cy={110} rx="2.4" ry="5" fill="none" stroke={i === 1 ? '#fbbf24' : '#16a34a'} strokeWidth="1.2" />
      ))}
      {/* Shaligram, the groom, crowned on his stand */}
      <path d="M140 196 h34 l-4 -10 h-26 Z" fill={`url(#${id}gold)`} stroke="#b45309" />
      <ellipse cx="157" cy="176" rx="13" ry="11" fill="#1f2937" />
      <ellipse cx="152" cy="171" rx="4" ry="3" fill="#475569" />
      <path d="M144 182 Q157 192 170 182" stroke="#facc15" strokeWidth="3" fill="none" />
      <Crown id={id} cx={157} y={164} w={18} />
      {/* The varmala joining them */}
      <Marigolds x0={124} y0={124} cx={140} cy={168} x1={150} y1={166} n={7} r={3} />
      <Diya x={60} y={214} s={0.9} />
      <Diya x={150} y={214} s={0.9} />
      <Sparkle x={34} y={120} r={4} />
      <Sparkle x={188} y={120} r={4} />
    </>
  )
}

export const SCENES_B: Record<string, { draw: Draw; viewBox: string; label: string }> = {
  guru_purnima: { draw: guruPurnima, viewBox: '0 0 220 220', label: 'A guru blessing his disciple under the full moon' },
  independence_day: { draw: independenceDay, viewBox: '0 0 220 220', label: 'The national flag over the Red Fort' },
  onam: { draw: onam, viewBox: '0 0 220 220', label: 'King Mahabali and the pookalam' },
  navratri: { draw: durga, viewBox: '0 0 220 220', label: 'Maa Durga' },
  dussehra: { draw: dussehra, viewBox: '0 0 220 220', label: "Ravana's effigy struck by Rama's arrow" },
  karwa_chauth: { draw: karwaChauth, viewBox: '0 0 220 220', label: 'A wife seeing the moon through her sieve' },
  dhanteras: { draw: dhanvantari, viewBox: '0 0 220 220', label: 'Lord Dhanvantari with the nectar of life' },
  kali_chaudas: { draw: kali, viewBox: '0 0 220 220', label: 'Maa Kali' },
  nutan_varsh: { draw: govardhan, viewBox: '0 0 220 220', label: 'Krishna lifting Govardhan' },
  bhai_dooj: { draw: bhaiDooj, viewBox: '0 0 220 220', label: 'A sister putting a tilak on her brother' },
  labh_pancham: { draw: labhPancham, viewBox: '0 0 220 220', label: 'The new account book: Shubh Labh' },
  chhath_puja: { draw: chhath, viewBox: '0 0 220 220', label: 'Arghya to the setting sun' },
  tulsi_vivah: { draw: tulsiVivah, viewBox: '0 0 220 220', label: 'Tulsi dressed as a bride, wed to Shaligram' },
}
