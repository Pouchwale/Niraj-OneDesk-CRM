/**
 * The production process: one command, one port, the whole product.
 *
 * It serves the built front end and the API from the same origin, states what
 * it is and is not connected to on the way up, and stops without cutting
 * anybody's request in half on the way down.
 */

import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { createApp } from './app'
import { ConfigError, loadConfig, preferredPathEnv, type ServerConfig } from './config'
import { loadEnvFiles } from './env'
import { createLogger, type Logger } from './logger'
import { BOOK_LABEL, EXCEL_BOOKS } from '../shared/api'

/** Seconds an in-flight request gets to finish before the process gives up. */
const SHUTDOWN_GRACE_MS = 10_000

/**
 * What is wired up, said plainly at boot.
 *
 * A missing key or an unreachable workbook is not a reason to refuse to start
 * — the rest of the app still works — but it is a reason to say so loudly,
 * once, where whoever started the server will see it.
 */
function reportReadiness(config: ServerConfig, log: Logger): void {
  if (config.ai.provider) log.info(`assistant: ${config.ai.provider} · ${config.ai.model}`)
  else log.warn('assistant: no key configured, Robi answers from the rules only')

  for (const book of EXCEL_BOOKS) {
    const entry = config.excel[book]
    if (!entry) {
      log.info(`${BOOK_LABEL[book]}: no Excel file connected (set ${preferredPathEnv(book)})`)
    } else if (existsSync(entry.path)) {
      log.info(`${BOOK_LABEL[book]}: connected`, { path: entry.path })
    } else {
      log.warn(`${BOOK_LABEL[book]}: the configured file is not there`, { path: entry.path })
    }
  }

  for (const key of config.unknownExcelKeys) {
    log.warn('this setting is read by nobody and is probably a typo', { key })
  }
}

function main(): void {
  const files = loadEnvFiles()

  let config: ServerConfig
  try {
    config = loadConfig()
  } catch (err) {
    // Before the logger exists, and the only thing worth saying.
    process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`)
    process.exit(1)
    return
  }

  const logger = createLogger({ level: config.logLevel, json: config.isProduction })
  if (files.length > 0) logger.debug('settings loaded from file', { files: files.join(', ') })

  const hasBuild = existsSync(config.staticDir)
  if (config.isProduction && !hasBuild) {
    logger.error('no built front end to serve; run `npm run build` first', { staticDir: config.staticDir })
  }

  const app = createApp(config, logger, {
    version: process.env.npm_package_version ?? '1.0.0',
    ...(hasBuild ? { staticDir: config.staticDir } : {}),
  })

  const server = createServer(app)

  server.listen(config.port, config.host, () => {
    logger.info(`coordinator listening on http://${config.host}:${config.port}`, { env: config.env })
    reportReadiness(config, logger)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`port ${config.port} is already in use; set PORT to something else`)
      process.exit(1)
    }
    logger.error('the server could not start', { err: err.message })
    process.exit(1)
  })

  // An orchestrator sends SIGTERM and then waits. Finish what is in flight,
  // stop taking new work, and leave — a killed request loses somebody's typing.
  let stopping = false
  const shutdown = (signal: string) => {
    if (stopping) return
    stopping = true
    logger.info('shutting down', { signal })

    const forced = setTimeout(() => {
      logger.warn('a request would not finish in time; exiting anyway')
      process.exit(1)
    }, SHUTDOWN_GRACE_MS)
    forced.unref()

    server.close(() => {
      clearTimeout(forced)
      logger.info('stopped cleanly')
      process.exit(0)
    })
    server.closeIdleConnections()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // A process in an unknown state should not keep answering: it is logged in
  // full and restarted by whatever supervises it.
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', { err: err.message, stack: err.stack })
    shutdown('uncaughtException')
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', {
      err: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })
}

main()
