import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'

import {
  ConfigError,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENAI_MODEL,
  loadConfig,
  preferredPathEnv,
  resolveAi,
  resolveExcel,
  unknownExcelKeys,
} from './config'

const workbook = resolve('C:/books/ageing.xlsx')

describe('resolveAi', () => {
  it('reads the key, model and effort, with safe defaults', () => {
    expect(resolveAi({})).toEqual({
      provider: null,
      apiKey: undefined,
      model: DEFAULT_ANTHROPIC_MODEL,
      effort: 'medium',
      maxTokens: 4096,
    })

    expect(
      resolveAi({ ANTHROPIC_API_KEY: ' sk-ant-test ', AI_MODEL: 'claude-sonnet-5', AI_EFFORT: 'HIGH' }, 2000)
    ).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-5',
      effort: 'high',
      maxTokens: 2000,
    })
  })

  it('treats a blank key as not configured and ignores a nonsense effort', () => {
    expect(resolveAi({ ANTHROPIC_API_KEY: '   ', AI_EFFORT: 'turbo' })).toMatchObject({
      provider: null,
      apiKey: undefined,
      effort: 'medium',
    })
  })

  it('picks Groq from its own key, or from a Groq key in the Anthropic slot', () => {
    expect(resolveAi({ GROQ_API_KEY: ' gsk_12345 ' })).toMatchObject({
      provider: 'groq',
      apiKey: 'gsk_12345',
      model: DEFAULT_GROQ_MODEL,
    })
    // A key pasted into the wrong slot is a mistake people make; honour it.
    expect(resolveAi({ ANTHROPIC_API_KEY: 'gsk_in_the_wrong_slot' })).toMatchObject({
      provider: 'groq',
      model: DEFAULT_GROQ_MODEL,
    })
  })

  it('picks OpenAI from its own key, or from an OpenAI key in the other slots', () => {
    expect(resolveAi({ OPENAI_API_KEY: ' sk-proj-12345 ' })).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-proj-12345',
      model: DEFAULT_OPENAI_MODEL,
    })
    expect(resolveAi({ ANTHROPIC_API_KEY: 'sk-proj-in-anthropic-slot' })).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-proj-in-anthropic-slot',
      model: DEFAULT_OPENAI_MODEL,
    })
    expect(resolveAi({ GROQ_API_KEY: 'sk-proj-in-groq-slot' })).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-proj-in-groq-slot',
      model: DEFAULT_OPENAI_MODEL,
    })
  })
})

describe('resolveExcel', () => {
  it('reads a path per book and resolves it', () => {
    const config = resolveExcel({
      EXCEL_OVERDUE_PAYMENTS_PATH: workbook,
      EXCEL_OVERDUE_PAYMENTS_SHEET: 'Ageing',
      EXCEL_ACTIVE_PAYMENTS_PATH: ' ',
    })
    expect(config.overdue).toEqual({ path: workbook, sheet: 'Ageing' })
    // A blank path is not a configured book.
    expect(config.companies).toBeUndefined()
  })

  it('names each book after the screen it feeds', () => {
    expect(preferredPathEnv('companies')).toBe('EXCEL_ACTIVE_PAYMENTS_PATH')
    expect(preferredPathEnv('overdue')).toBe('EXCEL_OVERDUE_PAYMENTS_PATH')
  })

  it('still answers to the older and singular spellings', () => {
    expect(resolveExcel({ EXCEL_COMPANIES_PATH: workbook }).companies?.path).toBe(workbook)
    expect(resolveExcel({ EXCEL_ACTIVE_PAYMENT_PATH: workbook }).companies?.path).toBe(workbook)
    expect(resolveExcel({ EXCEL_OVERDUE_PATH: workbook }).overdue?.path).toBe(workbook)
  })

  it('prefers the current name when both are present', () => {
    const config = resolveExcel({
      EXCEL_ACTIVE_PAYMENTS_PATH: workbook,
      EXCEL_COMPANIES_PATH: resolve('C:/books/older.xlsx'),
    })
    expect(config.companies?.path).toBe(workbook)
  })

  it('is empty when nothing is configured', () => {
    expect(resolveExcel({})).toEqual({})
  })
})

describe('unknownExcelKeys', () => {
  it('catches a misspelling that would otherwise fail silently', () => {
    expect(unknownExcelKeys({ EXCEL_ACTIVE_PAYMENY_PATH: workbook })).toEqual(['EXCEL_ACTIVE_PAYMENY_PATH'])
  })

  it('stays quiet about every name that is read, and about other settings', () => {
    expect(
      unknownExcelKeys({
        EXCEL_ACTIVE_PAYMENTS_PATH: workbook,
        EXCEL_OVERDUE_PAYMENTS_PATH: workbook,
        EXCEL_COMPANIES_SHEET: 'Sheet1',
        GROQ_API_KEY: 'gsk_x',
      })
    ).toEqual([])
  })
})

describe('loadConfig', () => {
  it('runs on an empty environment with production-safe defaults', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({
      env: 'development',
      isProduction: false,
      port: 8080,
      host: '0.0.0.0',
      logLevel: 'info',
      corsOrigins: [],
      aiRateLimitPerMinute: 20,
    })
    expect(config.staticDir).toBe(resolve('dist'))
  })

  it('reads the deployment settings', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '3000',
      CORS_ORIGINS: 'https://crm.example.com, https://admin.example.com',
      AI_RATE_LIMIT_PER_MINUTE: '5',
    })
    expect(config.isProduction).toBe(true)
    expect(config.port).toBe(3000)
    expect(config.corsOrigins).toEqual(['https://crm.example.com', 'https://admin.example.com'])
    expect(config.aiRateLimitPerMinute).toBe(5)
  })

  it('refuses to start on a setting that cannot mean anything, and says which', () => {
    // Better a clear failure at boot than a mystery at three in the afternoon.
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(ConfigError)
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/)
    expect(() => loadConfig({ LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL/)
  })
})
