import { useEffect, useState } from 'react'

/**
 * Tracks a CSS media query from JS.
 *
 * Needed where a breakpoint has to change behaviour rather than just styling —
 * the sidebar, for instance, forces itself into the icon rail on narrow
 * screens regardless of what the user last chose.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** True from Tailwind's `lg` breakpoint up, where the full sidebar fits. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
