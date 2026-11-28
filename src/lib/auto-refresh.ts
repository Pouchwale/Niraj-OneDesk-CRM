/**
 * Automatic refresh after a deploy (28 Nov 2026, the user: no more asking
 * everyone to press F5). Every minute the page asks the server for index.html
 * (never cached) and compares its main script with the one running. When a
 * new version is out it reloads at a safe moment only, so nothing typed is
 * lost:
 *  - the tab is in the background, or
 *  - the person moves to another page in the CRM, or
 *  - nobody has touched the page for IDLE_MS, no box is being typed in and
 *    no dialog is open.
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export const CHECK_MS = 60_000
export const IDLE_MS = 3 * 60_000

/** The main script an index.html loads ("/assets/index-AbC123.js"), or null. */
export function mainScriptOf(html: string): string | null {
  return /\/assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null
}

/** Whether reloading now would lose nothing: no box focused for typing, no dialog open. */
export function safeToReload(doc: Pick<Document, 'activeElement' | 'querySelector'>): boolean {
  const el = doc.activeElement as HTMLElement | null
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  return !typing && !doc.querySelector('[role="dialog"], [role="alertdialog"]')
}

function runningScript(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return s ? mainScriptOf(s.getAttribute('src') ?? '') : null
}

export function useAutoRefresh(): void {
  const location = useLocation()
  const pending = useRef(false)
  const first = useRef(true)

  // Moving to another page is a safe moment: the page is being replaced anyway.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (pending.current) window.location.reload()
  }, [location.pathname])

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const running = runningScript()
    if (!running) return
    let lastActive = Date.now()
    const active = () => {
      lastActive = Date.now()
    }
    const reload = () => window.location.reload()
    const check = async () => {
      if (!pending.current) {
        try {
          const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
          const next = res.ok ? mainScriptOf(await res.text()) : null
          if (next && next !== running) pending.current = true
        } catch {
          // Server restarting or offline: ask again next time.
        }
      }
      if (!pending.current) return
      if (document.hidden) reload()
      else if (Date.now() - lastActive >= IDLE_MS && safeToReload(document)) reload()
    }
    const onVisibility = () => {
      if (document.hidden && pending.current) reload()
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, active, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(() => void check(), CHECK_MS)
    return () => {
      window.clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, active))
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
