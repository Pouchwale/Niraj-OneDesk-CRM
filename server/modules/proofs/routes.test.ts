import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { describe, expect, it } from 'vitest'

import { errorHandler } from '../../http/errors'
import { proofRoutes } from './routes'

describe('proof screenshots', () => {
  it('are served from a dot-folder, the way the live .crm-data is named', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'proofs-')), '.crm-data', 'proofs')
    const app = express()
    app.use((req, _res, next) => {
      req.user = { id: 'admin-1', role: 'team_leader' } as never
      next()
    })
    app.use('/api/proofs', proofRoutes(dir))
    app.use(errorHandler(console as never))
    writeFileSync(join(dir, 'coord-5-1-abc.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

    const server = app.listen(0)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/proofs/coord-5-1-abc.jpg`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('image/jpeg')
    } finally {
      server.close()
    }
  })
})
