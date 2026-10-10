/**
 * The API, assembled once and used by both worlds.
 *
 * The same router is mounted into the Vite dev server and served by the
 * standalone production process, so a route behaves identically in
 * development and in production. Dev/prod drift in an API layer is the kind of
 * bug that only ever shows up in front of a customer.
 */

import express, { type Express, type Router } from 'express'
import compression from 'compression'
import helmet from 'helmet'
import { API_PREFIX } from '../shared/api'
import type { ServerConfig } from './config'
import { errorHandler, notFoundHandler } from './http/errors'
import { aiRateLimiter, cors, requestId, requestLogger } from './http/middleware'
import type { Logger } from './logger'
import { createAiService, type AiService, type AiServiceDeps } from './modules/ai/service'
import { aiRoutes } from './modules/ai/routes'
import { createExcelService } from './modules/excel/service'
import { excelRoutes } from './modules/excel/routes'
import { healthRoutes } from './modules/health/routes'
import { createSnapshotStore, type SnapshotStore } from './modules/snapshots/store'
import { snapshotRoutes } from './modules/snapshots/routes'
import { createAccountStore, type AccountStore } from './modules/auth/accounts'
import { createSessionSigner, loadSessionSecret } from './modules/auth/sessions'
import { requireRole, requireSession } from './modules/auth/middleware'
import { authRoutes } from './modules/auth/routes'
import { createDataStore, type DataStore } from './modules/data/store'
import { dataRoutes } from './modules/data/routes'
import { proofRoutes } from './modules/proofs/routes'
import { join } from 'node:path'

export interface ApiDeps {
  ai?: AiServiceDeps
  /** Made by the caller when it needs to reconfigure it later. */
  aiService?: AiService
  version?: string
  /** Swapped in tests for a store in a temporary folder. */
  snapshots?: SnapshotStore
  /** The same, for the accounts. */
  accounts?: AccountStore
  /** The same, for the shared working dataset. */
  data?: DataStore
}

/**
 * The whole API in one mountable piece: middleware, routes and its own error
 * handling. Self-contained on purpose, so wherever it is mounted it behaves
 * the same and cannot leak a raw stack trace into someone else's response.
 */
export function createApiRouter(config: ServerConfig, logger: Logger, deps: ApiDeps = {}): Router {
  const router = express.Router()
  const ai = deps.aiService ?? createAiService(config.ai, logger, deps.ai)
  const excel = createExcelService(config.excel)

  // An id first, so every line logged after this point can be correlated.
  router.use(requestId())
  router.use(requestLogger(logger))
  // Before the body parser: a preflight carries no body worth reading.
  router.use(cors(config))

  /*
   * Who is asking. The browser used to decide that for itself — the roster and
   * the session both sat in localStorage — so every route below was open to
   * anyone who could reach the port.
   */
  const accounts = deps.accounts ?? createAccountStore(config.authDir)
  const sessions = createSessionSigner(
    loadSessionSecret(config.authDir, config.sessionSecret),
    config.sessionHours
  )
  // The one copy of the CRM everybody shares.
  const data = deps.data ?? createDataStore(config.dataDir)

  // A saved day carries the whole Overdue book — a few hundred kilobytes — so
  // these routes read their own, larger bodies and sit before the 1 MB limit.
  router.use(
    '/snapshots',
    requireSession(accounts, sessions),
    requireRole('team_leader'),
    snapshotRoutes(deps.snapshots ?? createSnapshotStore(config.snapshotDir), logger)
  )
  /*
   * The working dataset is mounted first, with a body limit of its own: a day's
   * import arrives as one batch of a few thousand rows, which is megabytes, and
   * every other route should stay on the tight 1mb limit below.
   */
  router.use(
    '/data',
    express.json({ limit: '64mb' }),
    requireSession(accounts, sessions),
    dataRoutes(data, logger)
  )

  // Proof screenshots read their own image bodies, so they sit before the JSON limit.
  router.use('/proofs', requireSession(accounts, sessions), proofRoutes(join(config.dataDir, 'proofs')))

  router.use(express.json({ limit: '1mb' }))

  router.use(healthRoutes(config, ai, excel, deps.version ?? 'dev'))
  // Only the model route is rate limited: it is the one that costs money.
  // The budget guards the route that spends money. Asking whether a key is
  // configured costs nothing, and metering it only made the assistant report
  // itself offline for a minute after a handful of quick page loads.
  router.use('/ai/chat', aiRateLimiter(config))
  // The only routes that answer without a session: signing in, and asking
  // whether this browser already has one.
  router.use('/auth', authRoutes(accounts, sessions, logger))
  router.use('/ai', requireSession(accounts, sessions), aiRoutes(ai))
  router.use('/excel', requireSession(accounts, sessions), excelRoutes(excel, logger))

  router.use(notFoundHandler)
  router.use(errorHandler(logger))
  return router
}

/** The API as a standalone app, for mounting inside another server in dev. */
export function createApiApp(config: ServerConfig, logger: Logger, deps: ApiDeps = {}): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(API_PREFIX, createApiRouter(config, logger, deps))
  return app
}

/**
 * The production server: the API, and the built front end alongside it.
 *
 * Serving both from one origin means no CORS to configure, no third-party
 * cookie problems, and one thing to deploy.
 */
export function createApp(
  config: ServerConfig,
  logger: Logger,
  deps: ApiDeps & { staticDir?: string } = {}
): Express {
  const app = express()

  // Behind a load balancer the client address and protocol come from the proxy
  // headers. Without this the rate limiter would see one address for everyone.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(
    helmet({
      // The app is a single-page bundle served from this origin; a default CSP
      // would block its own styles and the fonts it loads.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  )
  app.use(compression())

  app.use(API_PREFIX, createApiRouter(config, logger, deps))

  if (deps.staticDir) {
    const root = deps.staticDir
    // Hashed asset names are safe to cache forever; index.html never is, or a
    // deploy leaves browsers running the previous bundle.
    app.use(
      express.static(root, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, file) => {
          if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
        },
      })
    )
    // Client-side routing: any path that is not a file is one of the app's own.
    app.get(/.*/, (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile('index.html', { root }, (err) => {
        if (err) next(err)
      })
    })
  }

  app.use(errorHandler(logger))
  return app
}
