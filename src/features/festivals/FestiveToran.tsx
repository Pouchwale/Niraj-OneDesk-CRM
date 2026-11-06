/**
 * A toran hung under the header on festival days (6 Nov 2026): marigolds and
 * mango leaves, or bright bunting for Navratri, Holi and the national days.
 * Purely decorative: it never takes a click.
 */

import { useId } from 'react'
import { THEMES } from './festival-themes'
import { useFestivals } from './useFestivals'

const BUNTING = new Set(['navratri', 'tricolor', 'holi', 'celebration', 'sankranti'])

export function FestiveToran() {
  const id = useId().replace(/:/g, '')
  const { config, primary } = useFestivals()
  if (!config.enabled || !config.decorations || !primary) return null
  const theme = THEMES[primary.festival.theme]
  const bunting = BUNTING.has(primary.festival.theme)
  const flags = theme.palette.slice(0, 3)

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full z-20 hidden h-6 overflow-hidden sm:block">
      <svg className="festive-toran" width="100%" height="24">
        <defs>
          {bunting ? (
            <pattern id={`${id}p`} width="72" height="24" patternUnits="userSpaceOnUse">
              <path d="M0 2 Q36 9 72 2" stroke="#a16207" strokeWidth="1" fill="none" />
              {flags.map((c, i) => (
                <path key={i} d={`M${4 + i * 24} ${3 + (i === 1 ? 1.5 : 0.5)} L${20 + i * 24} ${3 + (i === 1 ? 1.5 : 1)} L${12 + i * 24} ${17 + (i === 1 ? 1 : 0)} Z`} fill={c} stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
              ))}
            </pattern>
          ) : (
            <pattern id={`${id}p`} width="56" height="24" patternUnits="userSpaceOnUse">
              <path d="M0 2 Q28 14 56 2" stroke="#15803d" strokeWidth="1.1" fill="none" />
              <line x1="28" y1="8" x2="28" y2="13" stroke="#15803d" strokeWidth="0.8" />
              <path d="M28 12 Q33 16.5 28 22 Q23 16.5 28 12Z" fill="#16a34a" />
              <path d="M28 13 L28 21" stroke="#bbf7d0" strokeWidth="0.5" />
              {[
                [14, 6.5, '#f97316'],
                [42, 6.5, '#facc15'],
                [0, 2, '#facc15'],
                [56, 2, '#facc15'],
              ].map(([x, y, c], i) => (
                <g key={i}>
                  <circle cx={x as number} cy={y as number} r="4.4" fill={c as string} />
                  <circle cx={x as number} cy={y as number} r="2.3" fill={c === '#f97316' ? '#fb923c' : '#fde047'} />
                </g>
              ))}
            </pattern>
          )}
        </defs>
        <rect width="100%" height="24" fill={`url(#${id}p)`} />
      </svg>
    </div>
  )
}
