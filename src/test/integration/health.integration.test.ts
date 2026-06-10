import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api/health/route'

import { assertTestDatabase } from './db'

describe('/api/health', () => {
  it('responde 200 com banco acessível', async () => {
    assertTestDatabase()
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' })
  })
})
