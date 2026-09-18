/**
 * The two Excel routes: what is connected, and the bytes of one workbook.
 */

import { Router } from 'express'
import { EXCEL_HEADERS, isExcelBook, type ExcelStatusResponse } from '../../../shared/api'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import type { ExcelService } from './service'

export function excelRoutes(service: ExcelService, logger: Logger): Router {
  const router = Router()

  router.get('/status', (_req, res) => {
    const body: ExcelStatusResponse = { books: service.statusAll() }
    res.json(body)
  })

  router.get('/file', (req, res, next) => {
    const book = req.query.book
    // The only thing a caller may choose is which configured book to read.
    if (!isExcelBook(book)) {
      next(ApiError.badRequest('Ask for book=companies or book=overdue.'))
      return
    }

    let file
    try {
      file = service.open(book)
    } catch (err) {
      next(err)
      return
    }

    res.writeHead(200, {
      'Content-Type': file.contentType,
      'Cache-Control': 'no-store',
      // The app compares this against its last import to spot a fresh save.
      [EXCEL_HEADERS.modifiedAt]: file.modifiedAt,
      [EXCEL_HEADERS.name]: encodeURIComponent(file.name),
      ...(file.sheet ? { [EXCEL_HEADERS.sheet]: encodeURIComponent(file.sheet) } : {}),
      'Access-Control-Expose-Headers': Object.values(EXCEL_HEADERS).join(', '),
    })

    file.stream.on('error', (err) => {
      // Headers are already out, so the only honest thing left is to stop.
      logger.error('reading the workbook failed mid-stream', { book, err: err.message })
      res.end()
    })
    file.stream.pipe(res)
  })

  return router
}
