/**
 * The festival chip in the header (6 Nov 2026): today's festival, or the
 * countdown to the next big one, or a small icon on ordinary days. It opens
 * the festival panel.
 */

import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { PartyPopper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { onFestivalPanel } from './festival-bus'
import { THEMES } from './festival-themes'
import { useFestivals } from './useFestivals'

const FestivalPanel = lazy(() => import('./FestivalPanel'))

export function FestivalChip() {
  const { config, primary, soon } = useFestivals()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(
    () =>
      onFestivalPanel((id) => {
        setFocusId(id)
        setLoaded(true)
        setOpen(true)
      }),
    []
  )

  if (!config.enabled) return null
  const f = primary?.festival ?? soon?.festival ?? null
  const label = primary ? primary.festival.name : soon ? (soon.inDays === 1 ? `${soon.festival.name} tomorrow` : `${soon.festival.name} in ${soon.inDays} days`) : null
  const accent = f ? THEMES[f.theme].accent : undefined
  // On the day: the festival's colours; before it: only the glow colour.
  const style = (
    primary && accent
      ? { '--festive': accent, background: `linear-gradient(135deg, ${accent}, ${THEMES[primary.festival.theme].palette[1] ?? accent})`, borderColor: accent }
      : accent
        ? { '--festive': accent }
        : undefined
  ) as CSSProperties | undefined

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFocusId(null)
          setLoaded(true)
          setOpen(true)
        }}
        title={label ? `${label} · Robi’s festival corner` : 'Festivals'}
        aria-label={label ? `${label}. Open the festival panel` : 'Open the festival panel'}
        style={style}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          primary
            ? 'festive-chip border px-3 text-white shadow-sm'
            : soon
              ? 'border border-border/80 bg-muted/40 px-3 text-foreground hover:bg-muted'
              : 'w-9 justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )}
      >
        {f ? <span aria-hidden>{f.emoji}</span> : <PartyPopper className="h-[18px] w-[18px]" />}
        {label && <span className="hidden max-w-40 truncate sm:inline">{label}</span>}
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <FestivalPanel open={open} onOpenChange={setOpen} festivalId={focusId} />
        </Suspense>
      )}
    </>
  )
}
