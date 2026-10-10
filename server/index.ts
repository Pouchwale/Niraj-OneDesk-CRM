/**
 * The production process: one command, one port, the whole product.
 *
 * It serves the built front end and the API from the same origin, states what
 * it is and is not connected to on the way up, and stops without cutting
 * anybody's request in half on the way down.
 */

import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { createApp } from './app'
import { ConfigError, loadConfig, preferredPathEnv, type AiConfig, type ServerConfig } from './config'
import { loadEnvFiles, readEnvFiles, watchEnvFiles } from './env'
import { createLogger, type Logger } from './logger'
import { createAiService } from './modules/ai/service'
import { BOOK_LABEL, EXCEL_BOOKS } from '../shared/api'

/** Seconds an in-flight request gets to finish before the process gives up. */
const SHUTDOWN_GRACE_MS = 10_000

const AI_KEY_NAMES = ['OPENAI_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY'] as const

/**
 * A key set in the Windows environment beats the one in `.env.local`, so
 * replacing the key in the file would change nothing. Say so rather than let
 * somebody wonder why the new key is not being used.
 */
function warnShadowedKeys(operatorEnv: NodeJS.ProcessEnv, fileEnv: Record<string, string>, log: Logger): void {
  for (const name of AI_KEY_NAMES) {
    const fromSystem = operatorEnv[name]?.trim()
    const fromFile = fileEnv[name]?.trim()
    if (fromSystem && fromFile && fromSystem !== fromFile) {
      log.warn(`${name} is also set in the system environment, which wins; the one in .env.local is ignored`)
    }
  }
}

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

function getLanAddresses(): string[] {
  const nets = networkInterfaces()
  const addresses: string[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address)
      }
    }
  }
  return addresses
}

function main(): void {
  // What was set before any file was read. It wins now and on every reload.
  const operatorEnv = { ...process.env }
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

  const ai = createAiService(config.ai, logger)
  const app = createApp(config, logger, {
    aiService: ai,
    version: process.env.npm_package_version ?? '1.0.0',
    ...(hasBuild ? { staticDir: config.staticDir } : {}),
  })

  const server = createServer(app)

  server.listen(config.port, config.host, () => {
    logger.info(`OneDesk CRM listening on port ${config.port}`)
    logger.info(`  Local URL:   http://localhost:${config.port}`)
    for (const ip of getLanAddresses()) {
      logger.info(`  LAN URL:     http://${ip}:${config.port}`)
    }
    reportReadiness(config, logger)
    warnShadowedKeys(operatorEnv, readEnvFiles(), logger)
    void ai.verify()
  })

  /*
   * A replaced assistant key used to need a restart that nobody knew about, so
   * the old key kept being sent. The assistant's settings now follow the file
   * on save; everything else still takes a restart.
   */
  let aiSettings: AiConfig = config.ai
  watchEnvFiles(() => {
    let fileEnv: Record<string, string>
    let next: AiConfig
    try {
      fileEnv = readEnvFiles()
      next = loadConfig({ ...fileEnv, ...operatorEnv }).ai
    } catch (err) {
      logger.warn('the settings file changed but could not be read; the assistant keeps its current settings', {
        err: err instanceof Error ? err.message : String(err),
      })
      return
    }
    if (JSON.stringify(next) === JSON.stringify(aiSettings)) return

    aiSettings = next
    ai.reconfigure(next)
    logger.info(
      next.provider
        ? `assistant settings reloaded: ${next.provider} · ${next.model}`
        : 'assistant key removed; Robi answers from the rules only'
    )
    warnShadowedKeys(operatorEnv, fileEnv, logger)
    void ai.verify()
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
