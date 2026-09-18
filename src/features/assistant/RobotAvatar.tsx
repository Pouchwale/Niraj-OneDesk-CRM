import { cn } from '@/lib/utils'

export type RobotMood = 'idle' | 'talking' | 'thinking' | 'happy'

interface RobotAvatarProps {
  mood?: RobotMood
  size?: number
  className?: string
}

/**
 * Robi's face. Drawn inline so it can blink, bob and talk with a few CSS
 * keyframes (see index.css) instead of shipping an animation library for a
 * 40-pixel robot.
 */
export function RobotAvatar({ mood = 'idle', size = 40, className }: RobotAvatarProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn('robi', `robi-${mood}`, className)}
    >
      {/* antenna */}
      <line x1="32" y1="6" x2="32" y2="14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle className="robi-antenna" cx="32" cy="5" r="3.5" fill="currentColor" />

      {/* head */}
      <rect x="10" y="14" width="44" height="36" rx="12" fill="currentColor" opacity="0.18" />
      <rect x="10" y="14" width="44" height="36" rx="12" fill="none" stroke="currentColor" strokeWidth="3" />

      {/* ears */}
      <rect x="4" y="27" width="6" height="10" rx="2" fill="currentColor" />
      <rect x="54" y="27" width="6" height="10" rx="2" fill="currentColor" />

      {/* eyes */}
      <g className="robi-eyes">
        <ellipse cx="24" cy="30" rx="4" ry="4.5" fill="currentColor" />
        <ellipse cx="40" cy="30" rx="4" ry="4.5" fill="currentColor" />
      </g>

      {/* mouth */}
      <path
        className="robi-mouth"
        d={mood === 'happy' ? 'M22 40 Q32 48 42 40' : 'M24 41 H40'}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* neck */}
      <rect x="26" y="50" width="12" height="6" rx="2" fill="currentColor" opacity="0.6" />
    </svg>
  )
}
