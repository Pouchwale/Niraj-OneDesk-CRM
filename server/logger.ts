/**
 * Structured logging.
 *
 * One JSON object per line in production, so a log shipper can index it, and
 * something readable on a developer's terminal. Every line can carry the
 * request id, which is what turns "it broke this morning" into a single
 * grep.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
  /** A logger that stamps every line with the same fields, such as a request id. */
  child(fields: Record<string, unknown>): Logger
}

export interface LoggerOptions {
  level?: LogLevel
  /** JSON lines for machines, or a short line for a person. */
  json?: boolean
  write?: (line: string) => void
}

/** Values that would be reckless to write down, redacted by key name. */
const SECRET_KEY = /key|token|secret|password|authorization/i

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : value
  }
  return out
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info'
  const json = options.json ?? process.env.NODE_ENV === 'production'
  const write = options.write ?? ((line: string) => process.stdout.write(line + '\n'))

  const make = (bound: Record<string, unknown>): Logger => {
    const log = (at: LogLevel, message: string, fields: Record<string, unknown> = {}) => {
      if (ORDER[at] < ORDER[level]) return
      const all = redact({ ...bound, ...fields })
      if (json) {
        write(JSON.stringify({ time: new Date().toISOString(), level: at, message, ...all }))
        return
      }
      const extras = Object.entries(all)
        .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
        .join(' ')
      write(`${at.padEnd(5)} ${message}${extras ? ' ' + extras : ''}`)
    }

    return {
      debug: (m, f) => log('debug', m, f),
      info: (m, f) => log('info', m, f),
      warn: (m, f) => log('warn', m, f),
      error: (m, f) => log('error', m, f),
      child: (fields) => make({ ...bound, ...fields }),
    }
  }

  return make({})
}
