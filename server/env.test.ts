import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { loadEnvFiles, parseEnvFile, readEnvFiles, watchEnvFiles } from './env'

const dir = mkdtempSync(join(tmpdir(), 'env-file-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('parseEnvFile', () => {
  it('reads plain assignments and ignores blanks and comments', () => {
    expect(
      parseEnvFile(['# a comment', '', 'PORT=3000', 'HOST = 127.0.0.1 ', 'export LOG_LEVEL=debug'].join('\n'))
    ).toEqual({ PORT: '3000', HOST: '127.0.0.1', LOG_LEVEL: 'debug' })
  })

  it('keeps a Windows path intact, backslashes, colon, spaces and all', () => {
    const line = 'EXCEL_ACTIVE_PAYMENTS_PATH=C:\\Users\\np133\\Downloads\\active payment.xlsx'
    expect(parseEnvFile(line).EXCEL_ACTIVE_PAYMENTS_PATH).toBe('C:\\Users\\np133\\Downloads\\active payment.xlsx')
  })

  it('strips quotes, and a trailing comment only outside them', () => {
    expect(parseEnvFile('A="a value"').A).toBe('a value')
    expect(parseEnvFile("B='#notacomment'").B).toBe('#notacomment')
    expect(parseEnvFile('C=value # explained').C).toBe('value')
  })

  it('keeps a value that itself contains an equals sign', () => {
    expect(parseEnvFile('KEY=abc=def=ghi').KEY).toBe('abc=def=ghi')
  })

  it('skips a line that is not an assignment', () => {
    expect(parseEnvFile('just some text\n=novalue')).toEqual({})
  })
})

describe('loadEnvFiles', () => {
  it('reads .env then .env.local, with the local file winning', () => {
    writeFileSync(join(dir, '.env'), 'PORT=1111\nSHARED=base\n')
    writeFileSync(join(dir, '.env.local'), 'PORT=2222\n')

    const env: NodeJS.ProcessEnv = {}
    expect(loadEnvFiles(dir, env)).toEqual(['.env', '.env.local'])
    expect(env.PORT).toBe('2222')
    expect(env.SHARED).toBe('base')
  })

  it('never overrides what an operator already set', () => {
    const env: NodeJS.ProcessEnv = { PORT: '9999' }
    loadEnvFiles(dir, env)
    expect(env.PORT).toBe('9999')
  })

  it('is content with no files at all', () => {
    const empty = mkdtempSync(join(tmpdir(), 'env-none-'))
    expect(loadEnvFiles(empty, {})).toEqual([])
    rmSync(empty, { recursive: true, force: true })
  })
})

describe('readEnvFiles', () => {
  it('merges the files the same way without touching the environment', () => {
    const own = mkdtempSync(join(tmpdir(), 'env-read-'))
    writeFileSync(join(own, '.env'), 'OPENAI_API_KEY=old\nSHARED=base\n')
    writeFileSync(join(own, '.env.local'), 'OPENAI_API_KEY=new\n')
    expect(readEnvFiles(own)).toEqual({ OPENAI_API_KEY: 'new', SHARED: 'base' })
    rmSync(own, { recursive: true, force: true })
  })
})

describe('watchEnvFiles', () => {
  it('notices a save, including a file that did not exist yet', async () => {
    const own = mkdtempSync(join(tmpdir(), 'env-watch-'))
    const onChange = vi.fn()
    const stop = watchEnvFiles(onChange, own, 20)
    try {
      writeFileSync(join(own, '.env.local'), 'OPENAI_API_KEY=new\n')
      await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3_000 })
    } finally {
      stop()
      rmSync(own, { recursive: true, force: true })
    }
  })
})
