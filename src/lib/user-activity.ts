/**
 * Is someone using the screen right this moment?
 *
 * Background work (a data refresh, Robi's idle moves) can wait a second for a
 * person who is scrolling or typing, so what they are doing never stutters.
 * Nothing is skipped, only moved to the next quiet moment.
 */

const QUIET_MS = 700
const SCROLL_QUIET_MS = 180

let lastInput = -Infinity
let lastScroll = -Infinity
let scrollTimer = 0
let watching = false

const now = () => performance.now()

function endScroll(): void {
  const left = SCROLL_QUIET_MS - (now() - lastScroll)
  if (left > 0) {
    scrollTimer = window.setTimeout(endScroll, left)
    return
  }
  scrollTimer = 0
  document.documentElement.removeAttribute('data-scrolling')
}

function onScroll(): void {
  lastScroll = lastInput = now()
  if (scrollTimer) return
  document.documentElement.setAttribute('data-scrolling', '')
  scrollTimer = window.setTimeout(endScroll, SCROLL_QUIET_MS)
}

function onInput(): void {
  lastInput = now()
}

/** Starts listening. Safe to call more than once. */
export function watchUserActivity(): void {
  if (watching || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  watching = true
  const passive = { passive: true, capture: true } as const
  window.addEventListener('wheel', onScroll, passive)
  window.addEventListener('touchmove', onScroll, passive)
  window.addEventListener('scroll', onScroll, passive)
  window.addEventListener('keydown', onInput, passive)
  window.addEventListener('pointerdown', onInput, passive)
}

export function userIsActive(): boolean {
  return now() - lastInput < QUIET_MS
}

/** Resolves at the next quiet moment, and never later than `maxWaitMs`. */
export function whenUserIsQuiet(maxWaitMs = 3000): Promise<void> {
  const deadline = now() + maxWaitMs
  return new Promise((resolve) => {
    const check = () => {
      if (!userIsActive() || now() >= deadline) resolve()
      else window.setTimeout(check, 120)
    }
    check()
  })
}
