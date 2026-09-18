/**
 * The contract between the browser and the server.
 *
 * Both sides import this one file, so a route that changes shape stops
 * compiling on both ends at once rather than failing at runtime in front of a
 * user. Nothing here imports from `src/` or `server/`: it is the seam, and it
 * has to stay free of either side's internals.
 */

export const API_PREFIX = '/api'

export const ROUTES = {
  health: `${API_PREFIX}/health`,
  ready: `${API_PREFIX}/ready`,
  aiStatus: `${API_PREFIX}/ai/status`,
  aiChat: `${API_PREFIX}/ai/chat`,
  excelStatus: `${API_PREFIX}/excel/status`,
  excelFile: `${API_PREFIX}/excel/file`,
  /** The working dataset everybody shares: read it, watch it, change it. */
  data: `${API_PREFIX}/data`,
  dataVersion: `${API_PREFIX}/data/version`,
  dataOps: `${API_PREFIX}/data/ops`,
} as const

/* ===================== Errors ===================== */

/**
 * Every failure the API returns, in one shape.
 *
 * `message` is written for the person on the screen; `code` is for the code
 * reading it. Internal detail never travels: a stack trace tells an attacker
 * about the server and tells the user nothing they can act on.
 */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    /** Correlates a report from a user with the server's own log line. */
    requestId?: string
  }
}

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'not_configured'
  | 'rate_limited'
  | 'upstream_failed'
  | 'internal'

/* ===================== Health ===================== */

export interface HealthResponse {
  status: 'ok'
  /** Seconds since the process started. */
  uptime: number
  version: string
}

export interface ReadyResponse {
  ready: boolean
  checks: { name: string; ok: boolean; detail?: string }[]
}

/* ===================== Assistant ===================== */

export type AiProvider = 'anthropic' | 'groq'

export interface AiStatusResponse {
  /** A key is present, so replies come from the model rather than the rules. */
  configured: boolean
  provider: AiProvider | null
  model: string | null
}

export interface AiChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatRequest {
  /** The persona. Stable, so it can be cached by the provider. */
  system: string
  /** The live records this answer must be drawn from. */
  context: string
  messages: AiChatTurn[]
}

/** Server-sent events the chat route emits, in order. */
export type AiChatEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; stop_reason?: string; model?: string; refused?: boolean }
  | { type: 'error'; message: string }

/* ===================== Excel books ===================== */

export const EXCEL_BOOKS = ['companies', 'overdue'] as const
export type ExcelBook = (typeof EXCEL_BOOKS)[number]

export function isExcelBook(value: unknown): value is ExcelBook {
  return typeof value === 'string' && (EXCEL_BOOKS as readonly string[]).includes(value)
}

/** What each screen calls its book. */
export const BOOK_LABEL: Record<ExcelBook, string> = {
  companies: 'Active Payments',
  overdue: 'Overdue Payments',
}

/** The setting that points at each book, named after the screen it feeds. */
export const BOOK_PATH_ENV: Record<ExcelBook, string> = {
  companies: 'EXCEL_ACTIVE_PAYMENTS_PATH',
  overdue: 'EXCEL_OVERDUE_PAYMENTS_PATH',
}

export interface ExcelBookStatus {
  book: ExcelBook
  /** A path is set in the environment. */
  configured: boolean
  /** Only the file name reaches the browser; the full path stays server-side. */
  name: string | null
  exists: boolean
  /** Last write time, the signal the app watches for a change. */
  modifiedAt: string | null
  size: number | null
  sheet: string | null
  /** Why the file could not be read, in words a person can act on. */
  error: string | null
}

export interface ExcelStatusResponse {
  books: Record<ExcelBook, ExcelBookStatus>
}

/** Headers the file route sets so the client can spot a fresh save. */
export const EXCEL_HEADERS = {
  modifiedAt: 'x-excel-modified-at',
  name: 'x-excel-name',
  sheet: 'x-excel-sheet',
} as const
