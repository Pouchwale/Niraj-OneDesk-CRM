/**
 * Reading settings out of a `.env` file.
 *
 * A real deployment sets real environment variables; this exists so that
 * running the built server on the office machine works with the same
 * `.env.local` the dev server already uses, instead of asking somebody to
 * export a dozen variables by hand before every start.
 *
 * Anything already in the environment wins. A file must never quietly
 * override what an operator deliberately set on the command line.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Parses `.env` text: KEY=value per line, `#` comments, optional quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = line.slice(eq + 1).trim()

    // Quotes are stripped; without them a trailing comment is not part of the
    // value. Windows paths contain no `#`, so this is safe for the Excel paths.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1)
    } else {
      const hash = value.indexOf(' #')
      if (hash >= 0) value = value.slice(0, hash).trim()
    }

    if (key) out[key] = value
  }

  return out
}

/** The files a run reads, least specific first. Later files win. */
export const ENV_FILES = ['.env', '.env.local'] as const

/**
 * Loads the env files into `process.env` without overwriting what is there.
 * Returns the names of the files that existed, for the startup log.
 */
export function loadEnvFiles(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = []
  // Only what the operator set counts as untouchable. A value this function
  // wrote a moment ago is fair game, which is how `.env.local` wins over `.env`.
  const preset = new Set(Object.keys(env))

  for (const name of ENV_FILES) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue

    for (const [key, value] of Object.entries(parseEnvFile(readFileSync(path, 'utf8')))) {
      if (!preset.has(key)) env[key] = value
    }
    loaded.push(name)
  }

  return loaded
}
