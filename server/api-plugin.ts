/**
 * The API inside the dev server.
 *
 * This mounts the very same Express app that production runs, so `npm run dev`
 * and a deployed container answer a request with identical code. The only
 * difference is who serves the HTML: Vite here, the built `dist/` there.
 *
 * Settings come from `.env.local` through Vite's own loader rather than
 * `process.env`, which is what keeps the API key out of the browser bundle —
 * it has no `VITE_` prefix, so Vite never inlines it.
 */

import type { Plugin, ViteDevServer } from 'vite'
import { loadEnv } from 'vite'
import { createApiApp } from './app'
import { ConfigError, loadConfig, preferredPathEnv } from './config'
import { createLogger } from './logger'
import { BOOK_LABEL, EXCEL_BOOKS } from '../shared/api'

export function apiPlugin(): Plugin {
  return {
    name: 'coordinator-api',
    // Preview serves the real build, so it needs the API too.
    apply: () => true,

    configureServer(server) {
      // Vitest spins up its own Vite server; the unit tests build the app
      // themselves and do not want a second one reading the real settings.
      if (!process.env.VITEST) mount(server)
    },
    configurePreviewServer(server) {
      mount(server)
    },
  }
}

type AnyServer = Pick<ViteDevServer, 'middlewares' | 'config'>

function mount(server: AnyServer): void {
  const mode = server.config.mode ?? 'development'
  // '' loads every variable, not only the VITE_-prefixed ones.
  const env = { ...process.env, ...loadEnv(mode, server.config.root ?? process.cwd(), '') }

  const logger = createLogger({ level: 'info', json: false })

  let config
  try {
    config = loadConfig(env)
  } catch (err) {
    logger.error(err instanceof ConfigError ? err.message : String(err))
    return
  }

  server.middlewares.use(createApiApp(config, logger))

  if (config.ai.provider) logger.info(`assistant: ${config.ai.provider} · ${config.ai.model}`)
  else logger.info('assistant: no key configured, Robi answers from the rules only')

  for (const book of EXCEL_BOOKS) {
    const entry = config.excel[book]
    logger.info(
      entry
        ? `${BOOK_LABEL[book]}: live Excel connected`
        : `${BOOK_LABEL[book]}: no Excel file connected (set ${preferredPathEnv(book)})`,
      entry ? { path: entry.path } : {}
    )
  }
}
