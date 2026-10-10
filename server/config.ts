/**
 * Every setting the server reads, resolved and checked once at boot.
 *
 * Configuration is validated up front rather than at the moment a request
 * needs it, so a mistyped path or a missing key is a line in the startup log
 * on a Tuesday afternoon instead of a 500 in front of a coordinator. Nothing
 * else in the server reads `process.env`.
 */

import { resolve } from 'node:path'
import { z } from 'zod'
import { BOOK_PATH_ENV, EXCEL_BOOKS, type AiProvider, type ExcelBook } from '../shared/api'

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5'
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

/**
 * The names each setting answers to, best first.
 *
 * Books are named after the screen they feed. Older spellings keep working so
 * an existing deployment does not break on upgrade.
 */
export const PATH_ENV: Record<ExcelBook, readonly string[]> = {
  companies: [BOOK_PATH_ENV.companies, 'EXCEL_ACTIVE_PAYMENT_PATH', 'EXCEL_COMPANIES_PATH'],
  overdue: [BOOK_PATH_ENV.overdue, 'EXCEL_OVERDUE_PAYMENT_PATH', 'EXCEL_OVERDUE_PATH'],
  rfd: [BOOK_PATH_ENV.rfd, 'EXCEL_READY_FOR_DISPATCH_PATH'],
}

export const SHEET_ENV: Record<ExcelBook, readonly string[]> = {
  companies: ['EXCEL_ACTIVE_PAYMENTS_SHEET', 'EXCEL_ACTIVE_PAYMENT_SHEET', 'EXCEL_COMPANIES_SHEET'],
  overdue: ['EXCEL_OVERDUE_PAYMENTS_SHEET', 'EXCEL_OVERDUE_PAYMENT_SHEET', 'EXCEL_OVERDUE_SHEET'],
  rfd: ['EXCEL_RFD_SHEET'],
}

export function preferredPathEnv(book: ExcelBook): string {
  return PATH_ENV[book][0]
}

export type RawEnv = Record<string, string | undefined>

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(8080),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Where the built front end lives, relative to the working directory. */
  STATIC_DIR: z.string().min(1).default('dist'),
  /** Comma-separated origins allowed to call the API from a browser. */
  CORS_ORIGINS: z.string().optional(),
  /** Requests per minute per client for the model route, which costs money. */
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().max(1_000).default(20),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_EFFORT: z.string().optional(),
  AI_MAX_TOKENS: z.coerce.number().int().positive().max(200_000).optional(),
  /** Where Weekly KPI keeps saved Overdue days and scores. */
  SNAPSHOT_DIR: z.string().optional(),
  /** Where the accounts and the session secret are kept. */
  AUTH_DIR: z.string().optional(),
  /** Where the shared working dataset lives — the CRM everyone sees. */
  DATA_DIR: z.string().optional(),
  /** Set one to survive moving the app; otherwise the server makes its own. */
  AUTH_SECRET: z.string().optional(),
  /** How long a session lasts without use. */
  SESSION_HOURS: z.coerce.number().positive().max(720).default(12),
})

export interface AiConfig {
  provider: AiProvider | null
  apiKey: string | undefined
  model: string
  effort: Effort
  maxTokens: number
}

export interface ExcelBookConfig {
  path: string
  sheet?: string
}

export interface ServerConfig {
  env: 'development' | 'production' | 'test'
  isProduction: boolean
  port: number
  host: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Absolute path to the built front end this server also hosts. */
  staticDir: string
  corsOrigins: string[]
  aiRateLimitPerMinute: number
  ai: AiConfig
  excel: Partial<Record<ExcelBook, ExcelBookConfig>>
  /** Where Weekly KPI keeps saved Overdue days and scores (on this machine's disk). */
  snapshotDir: string
  /** Where the accounts file and the session secret live. */
  authDir: string
  /** Where the shared working dataset lives — the CRM everyone sees. */
  dataDir: string
  /** An operator's own signing secret, where one is set. */
  sessionSecret: string | undefined
  sessionHours: number
  /** Settings that look like ours but are read by nobody: almost always typos. */
  unknownExcelKeys: string[]
}

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim()
  return out ? out : undefined
}

function firstValue(env: RawEnv, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = trimmed(env[name])
    if (value) return value
  }
  return undefined
}

function isEffort(value: string | undefined): value is Effort {
  return EFFORTS.includes(value as Effort)
}

/**
 * Which model provider the keys select.
 *
 * A Groq key pasted into the Anthropic slot is a mistake people actually make,
 * and the prefix identifies it unambiguously, so it is honoured rather than
 * rejected with a confusing authentication failure later.
 */
export function resolveAi(env: RawEnv, parsedMaxTokens?: number): AiConfig {
  const anthropicKey = trimmed(env.ANTHROPIC_API_KEY)
  const groqKey = trimmed(env.GROQ_API_KEY)
  const openaiKey = trimmed(env.OPENAI_API_KEY)

  let provider: AiProvider | null = null
  let apiKey: string | undefined = undefined
  let defaultModel = DEFAULT_ANTHROPIC_MODEL

  if (openaiKey) {
    provider = 'openai'
    apiKey = openaiKey
    defaultModel = DEFAULT_OPENAI_MODEL
  } else if (groqKey) {
    if (groqKey.startsWith('sk-proj-') || (!groqKey.startsWith('gsk_') && groqKey.startsWith('sk-'))) {
      provider = 'openai'
      apiKey = groqKey
      defaultModel = DEFAULT_OPENAI_MODEL
    } else {
      provider = 'groq'
      apiKey = groqKey
      defaultModel = DEFAULT_GROQ_MODEL
    }
  } else if (anthropicKey) {
    if (anthropicKey.startsWith('gsk_')) {
      provider = 'groq'
      apiKey = anthropicKey
      defaultModel = DEFAULT_GROQ_MODEL
    } else if (anthropicKey.startsWith('sk-proj-') || (!anthropicKey.startsWith('sk-ant-') && anthropicKey.startsWith('sk-'))) {
      provider = 'openai'
      apiKey = anthropicKey
      defaultModel = DEFAULT_OPENAI_MODEL
    } else {
      provider = 'anthropic'
      apiKey = anthropicKey
      defaultModel = DEFAULT_ANTHROPIC_MODEL
    }
  }

  const effort = trimmed(env.AI_EFFORT)?.toLowerCase()

  return {
    provider,
    apiKey,
    model: trimmed(env.AI_MODEL) ?? defaultModel,
    // Chat answers are short and latency matters more than depth here.
    effort: isEffort(effort) ? effort : 'medium',
    maxTokens: parsedMaxTokens ?? 4096,
  }
}

export function resolveExcel(env: RawEnv): Partial<Record<ExcelBook, ExcelBookConfig>> {
  const books: Partial<Record<ExcelBook, ExcelBookConfig>> = {}
  for (const book of EXCEL_BOOKS) {
    const path = firstValue(env, PATH_ENV[book])
    if (!path) continue
    const sheet = firstValue(env, SHEET_ENV[book])
    books[book] = { path: resolve(path), ...(sheet ? { sheet } : {}) }
  }
  return books
}

export function unknownExcelKeys(env: RawEnv): string[] {
  const known = new Set<string>([...Object.values(PATH_ENV).flat(), ...Object.values(SHEET_ENV).flat()])
  return Object.keys(env).filter((key) => key.startsWith('EXCEL_') && !known.has(key))
}

export class ConfigError extends Error {}

/** Reads and validates the environment. Throws with every problem listed. */
export function loadConfig(env: RawEnv = process.env): ServerConfig {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new ConfigError(`The server configuration is not usable:\n${problems.join('\n')}`)
  }

  const value = parsed.data
  return {
    env: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    port: value.PORT,
    host: value.HOST,
    logLevel: value.LOG_LEVEL,
    staticDir: resolve(value.STATIC_DIR),
    corsOrigins: (value.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    aiRateLimitPerMinute: value.AI_RATE_LIMIT_PER_MINUTE,
    ai: resolveAi(env, value.AI_MAX_TOKENS),
    excel: resolveExcel(env),
    snapshotDir: resolve(trimmed(value.SNAPSHOT_DIR) ?? '.crm-snapshots'),
    authDir: resolve(trimmed(value.AUTH_DIR) ?? '.crm-auth'),
    dataDir: resolve(trimmed(value.DATA_DIR) ?? '.crm-data'),
    sessionSecret: trimmed(value.AUTH_SECRET),
    sessionHours: value.SESSION_HOURS,
    unknownExcelKeys: unknownExcelKeys(env),
  }
}
