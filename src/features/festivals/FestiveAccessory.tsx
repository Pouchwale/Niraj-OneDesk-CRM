/**
 * The small festive thing Robi holds on a festival day (6 Nov 2026): a diya
 * on Diwali, a kite on Uttarayan, dandiya sticks in Navratri. Plain SVG,
 * drawn here, nothing downloaded.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { FestivalArt, hasFestivalArt } from './FestivalArt'
import { THEMES, type Accessory } from './festival-themes'
import { useFestivals } from './useFestivals'

function Flame({ x = 20, y = 18, h = 13 }: { x?: number; y?: number; h?: number }) {
  return (
    <g className="festive-flame" style={{ transformOrigin: `${x}px ${y}px` }}>
      <path d={`M${x} ${y - h} C${x + 4.2} ${y - h * 0.55} ${x + 4} ${y - 2} ${x} ${y} C${x - 4} ${y - 2} ${x - 4.2} ${y - h * 0.55} ${x} ${y - h}Z`} fill="#FFB300" />
      <path d={`M${x} ${y - h * 0.62} C${x + 2.2} ${y - h * 0.38} ${x + 2} ${y - 1.5} ${x} ${y - 0.6} C${x - 2} ${y - 1.5} ${x - 2.2} ${y - h * 0.38} ${x} ${y - h * 0.62}Z`} fill="#FFF3B0" />
    </g>
  )
}

const ring = (n: number, r: number, cx = 20, cy = 20) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)] as const)

function Drawing({ kind, id }: { kind: Accessory; id: string }) {
  switch (kind) {
    case 'diya':
      return (
        <>
          <circle cx="20" cy="12" r="10" fill={`url(#${id}g)`} />
          <Flame y={20} h={15} />
          <path d="M5 21 Q20 19 35 21 Q32 34 20 34 Q8 34 5 21Z" fill="#C2410C" />
          <path d="M5 21 Q20 24.5 35 21" stroke="#FDBA74" strokeWidth="1.6" fill="none" />
          <path d="M9 26 q2 2 4 0 q2 2 4 0 q2 2 4 0 q2 2 4 0 q2 2 4 0" stroke="#FCD34D" strokeWidth="1.2" fill="none" />
        </>
      )
    case 'kite':
      return (
        <>
          <path d="M20 3 L33 17 L20 31 L7 17 Z" fill="#EF4444" />
          <path d="M20 3 L33 17 L7 17 Z" fill="#FACC15" />
          <path d="M20 3 L20 31 M7 17 Q20 12 33 17" stroke="#7C2D12" strokeWidth="0.8" fill="none" />
          <path d="M20 31 L16.5 37.5 L23.5 37.5 Z" fill="#3B82F6" />
          <path d="M21 30 C27 34 31 36 39 39" stroke="#94A3B8" strokeWidth="0.8" fill="none" />
        </>
      )
    case 'dandiya':
      return (
        <>
          {[
            { a: -35, c: '#DB2777', b: '#FACC15' },
            { a: 35, c: '#7C3AED', b: '#F97316' },
          ].map(({ a, c, b }) => (
            <g key={a} transform={`rotate(${a} 20 20)`}>
              <rect x="18" y="2" width="4" height="36" rx="2" fill={c} />
              <rect x="18" y="7" width="4" height="3" fill={b} />
              <rect x="18" y="18.5" width="4" height="3" fill="#22C55E" />
              <rect x="18" y="30" width="4" height="3" fill={b} />
            </g>
          ))}
        </>
      )
    case 'feather':
      return (
        <>
          <path d="M11 38 Q17 25 22 11" stroke="#65A30D" strokeWidth="1.6" fill="none" />
          <g transform="rotate(22 24 13)">
            <ellipse cx="24" cy="13" rx="9" ry="12" fill="#16A34A" />
            <ellipse cx="24" cy="12" rx="5.6" ry="7" fill="#FBBF24" />
            <ellipse cx="24" cy="11.5" rx="4" ry="5" fill="#0D9488" />
            <ellipse cx="24" cy="11.2" rx="2.4" ry="3" fill="#1E3A8A" />
          </g>
        </>
      )
    case 'crescent':
      return (
        <>
          <mask id={`${id}m`}>
            <rect width="40" height="40" fill="white" />
            <circle cx="27" cy="15" r="12" fill="black" />
          </mask>
          <circle cx="20" cy="20" r="15" fill="#E0E7FF" mask={`url(#${id}m)`} />
          <circle cx="31" cy="27" r="1.6" fill="#FDE68A" />
        </>
      )
    case 'tilak':
      return (
        <>
          <ellipse cx="20" cy="28" rx="17" ry="7" fill="#CA8A04" />
          <ellipse cx="20" cy="27" rx="14" ry="5" fill="#FDE047" />
          <circle cx="12" cy="26.5" r="2.5" fill="#DC2626" />
          <circle cx="28" cy="26.5" r="1.6" fill="#FFFFFF" />
          <circle cx="30.5" cy="27.5" r="1.2" fill="#FFFFFF" />
          <path d="M16 25 Q20 24 24 25 Q23 29 20 29 Q17 29 16 25Z" fill="#C2410C" />
          <Flame y={24} h={11} />
        </>
      )
    case 'rakhi':
      return (
        <>
          <path d="M1 22 Q10 17 14 20" stroke="#DC2626" strokeWidth="2.2" fill="none" />
          <path d="M39 22 Q30 17 26 20" stroke="#DC2626" strokeWidth="2.2" fill="none" />
          {ring(8, 6.5).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.4" fill={i % 2 ? '#F59E0B' : '#FB7185'} />
          ))}
          <circle cx="20" cy="20" r="5.2" fill="#E11D48" />
          <circle cx="20" cy="20" r="2.4" fill="#FDE68A" />
        </>
      )
    case 'coin':
      return (
        <>
          <circle cx="20" cy="20" r="16" fill="#CA8A04" />
          <circle cx="20" cy="20" r="13" fill="#FACC15" stroke="#A16207" strokeWidth="1" />
          <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="700" fill="#A16207">
            ₹
          </text>
          <path d="M10.5 13 Q13.5 8.5 19 7.5" stroke="#FFF7CC" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      )
    case 'flower':
      return (
        <>
          {ring(12, 10).map(([x, y], i) => (
            <circle key={`o${i}`} cx={x} cy={y} r="5" fill="#F97316" />
          ))}
          {ring(9, 6).map(([x, y], i) => (
            <circle key={`m${i}`} cx={x} cy={y} r="4" fill="#FB923C" />
          ))}
          <circle cx="20" cy="20" r="5" fill="#FACC15" />
          <circle cx="20" cy="20" r="2" fill="#B45309" />
        </>
      )
    case 'sun':
      return (
        <>
          {ring(10, 15).map(([x, y], i) => (
            <line key={i} x1="20" y1="20" x2={x} y2={y} stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
          ))}
          <circle cx="20" cy="20" r="10" fill="#FBBF24" />
          <circle cx="20" cy="20" r="7" fill="#FDE047" />
        </>
      )
    case 'moon':
      return (
        <>
          <circle cx="20" cy="20" r="17" fill={`url(#${id}g)`} />
          <circle cx="20" cy="20" r="12" fill="#FEF9C3" />
          <circle cx="16" cy="16" r="2.4" fill="#FDE68A" />
          <circle cx="24" cy="23" r="1.8" fill="#FDE68A" />
          <circle cx="23" cy="14" r="1.2" fill="#FDE68A" />
        </>
      )
    case 'leaf':
      return (
        <>
          <path d="M20 38 L20 8" stroke="#3F6212" strokeWidth="1.6" />
          {[
            [20, 12, -40],
            [20, 12, 40],
            [20, 21, -45],
            [20, 21, 45],
            [20, 30, -50],
            [20, 30, 50],
          ].map(([x, y, a], i) => (
            <ellipse key={i} cx={x + (a < 0 ? -5 : 5)} cy={y} rx="6" ry="3" fill={i % 2 ? '#22C55E' : '#16A34A'} transform={`rotate(${a} ${x} ${y})`} />
          ))}
          <circle cx="20" cy="7" r="2" fill="#7C3AED" />
        </>
      )
    case 'flag':
      return (
        <>
          <line x1="7" y1="3" x2="7" y2="38" stroke="#78716C" strokeWidth="2" strokeLinecap="round" />
          <rect x="8" y="5" width="27" height="6" fill="#FF9933" />
          <rect x="8" y="11" width="27" height="6" fill="#FFFFFF" />
          <rect x="8" y="17" width="27" height="6" fill="#138808" />
          <circle cx="21.5" cy="14" r="2.3" fill="none" stroke="#000080" strokeWidth="0.8" />
        </>
      )
    case 'bow':
      return (
        <>
          <path d="M10 4 Q30 20 10 36" stroke="#92400E" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <line x1="10" y1="4" x2="10" y2="36" stroke="#E7E5E4" strokeWidth="0.9" />
          <line x1="6" y1="20" x2="36" y2="20" stroke="#EAB308" strokeWidth="1.6" />
          <path d="M36 20 L31 17 L31 23 Z" fill="#EAB308" />
          <path d="M6 20 L3 17 M6 20 L3 23" stroke="#DC2626" strokeWidth="1.4" />
        </>
      )
    case 'flame':
      return (
        <>
          <rect x="6" y="31" width="28" height="4" rx="2" fill="#78350F" transform="rotate(-12 20 33)" />
          <rect x="6" y="31" width="28" height="4" rx="2" fill="#92400E" transform="rotate(12 20 33)" />
          <Flame y={31} h={26} />
        </>
      )
    case 'garland':
      return (
        <>
          <path d="M3 6 Q20 40 37 6" stroke="#15803D" strokeWidth="1.2" fill="none" />
          {Array.from({ length: 9 }, (_, i) => {
            const t = (i + 0.5) / 9
            const x = (1 - t) * (1 - t) * 3 + 2 * (1 - t) * t * 20 + t * t * 37
            const y = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 40 + t * t * 6
            return <circle key={i} cx={x} cy={y} r="3.6" fill={i % 2 ? '#F97316' : '#FACC15'} />
          })}
        </>
      )
    case 'gulal':
      return (
        <>
          <circle cx="13" cy="20" r="6" fill="#EC4899" />
          <circle cx="21" cy="17" r="6.5" fill="#FACC15" />
          <circle cx="28" cy="21" r="5.5" fill="#22C55E" />
          <path d="M4 22 H36 Q34 35 20 35 Q6 35 4 22Z" fill="#B45309" />
          <path d="M4 22 H36" stroke="#FDBA74" strokeWidth="1.4" />
          <circle cx="8" cy="9" r="1.4" fill="#3B82F6" />
          <circle cx="32" cy="8" r="1.2" fill="#A855F7" />
          <circle cx="25" cy="5" r="1" fill="#EC4899" />
        </>
      )
    case 'party':
    default:
      return (
        <>
          <path d="M20 3 L32 34 L8 34 Z" fill="#6366F1" />
          <path d="M14.5 20 L25.5 20 L27.3 25 L12.7 25 Z" fill="#F59E0B" />
          <path d="M11 29 L29 29 L30.4 32 L9.6 32 Z" fill="#EC4899" />
          <circle cx="20" cy="4" r="3" fill="#FACC15" />
        </>
      )
  }
}

export function FestiveAccessory({ kind, size = 32, className, title }: { kind: Accessory; size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cn('festive-acc', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={`${id}g`}>
          <stop offset="0%" stopColor="#FFE08A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FFE08A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <Drawing kind={kind} id={id} />
    </svg>
  )
}

const NATIONAL_DAYS = new Set(['republic_day', 'independence_day'])

/** A festival's picture in icon spots: the tricolour, drawn, on the national days (Windows cannot show flag emoji), else its emoji. */
export function FestivalIcon({ festival, size = 24 }: { festival: { id: string; emoji: string }; size?: number }) {
  if (NATIONAL_DAYS.has(festival.id)) return <FestiveAccessory kind="flag" size={Math.round(size * 1.3)} />
  // The festival's deity or characters, where it has them (Lakshmi, Krishna, Shiva, Ganesha, the rakhi siblings).
  if (hasFestivalArt(festival.id)) return <FestivalArt festivalId={festival.id} size={Math.round(size * 1.5)} />
  return (
    <span aria-hidden style={{ fontSize: size, lineHeight: 1 }}>
      {festival.emoji}
    </span>
  )
}

/** Today's festival accessory for Robi's avatar, or nothing on an ordinary day. */
export function RobiFestiveBadge({ size = 30, className }: { size?: number; className?: string }) {
  const { primary } = useFestivals()
  if (!primary) return null
  const theme = THEMES[primary.festival.theme]
  return (
    <span className={cn('pointer-events-none absolute z-10 drop-shadow-md', className)}>
      <FestiveAccessory kind={theme.accessory} size={size} title={primary.festival.name} />
    </span>
  )
}
