import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/prisma'
import { listReceivables } from '@/server/repositories/receivable-repository'
import type { TenantContext } from '@/server/tenant/context'

import {
  assertTestDatabase,
  disconnectAdmin,
  getAdminPrisma,
  resetDb,
  seedBaseline,
  type Baseline,
} from './db'

/**
 * Decisão L do plano de correções: contas a receber não pode TRUNCAR em
 * silêncio (antes: take 500 fixo — a parcela 501 sumia da tela). Paginação por
 * cursor: páginas estáveis, sem buraco e sem duplicata, com hasMore/nextCursor.
 */
describe('listReceivables — paginação por cursor', () => {
  let base: Baseline
  let ctx: TenantContext

  const TOTAL = 120
  const PAGE = 50

  beforeAll(async () => {
    assertTestDatabase()
    await resetDb()
    base = await seedBaseline()
    ctx = {
      userId: 'test',
      organizationId: base.organizationId,
      role: 'ADMIN',
      clientId: null,
      clinicRoleId: null,
    }

    const admin = getAdminPrisma()
    const revenue = await admin.revenue.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        grossAmount: TOTAL * 100,
        discount: 0,
        amount: TOTAL * 100,
        date: new Date(),
        installments: TOTAL,
      },
      select: { id: true },
    })
    await admin.receivable.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        revenueId: revenue.id,
        installmentNumber: i + 1,
        amount: 100,
        dueDate: new Date(Date.UTC(2026, 0, 1 + i)),
      })),
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('percorre todas as parcelas sem buraco nem duplicata', async () => {
    const seen = new Set<string>()
    let cursor: string | undefined
    let pages = 0
    let lastHasMore = true

    while (lastHasMore) {
      const res = await listReceivables(ctx, base.clinicAId, undefined, {
        take: PAGE,
        ...(cursor ? { cursor } : {}),
      })
      pages++
      for (const row of res.rows) {
        expect(seen.has(row.id)).toBe(false) // sem duplicata entre páginas
        seen.add(row.id)
      }
      lastHasMore = res.hasMore
      cursor = res.nextCursor ?? undefined
      expect(pages).toBeLessThan(10) // guarda contra loop infinito
    }

    expect(seen.size).toBe(TOTAL) // nenhuma parcela truncada
    expect(pages).toBe(Math.ceil(TOTAL / PAGE))
  })

  it('páginas vêm em ordem de vencimento e hasMore é falso só na última', async () => {
    const p1 = await listReceivables(ctx, base.clinicAId, undefined, { take: PAGE })
    expect(p1.rows).toHaveLength(PAGE)
    expect(p1.hasMore).toBe(true)
    expect(p1.nextCursor).toBe(p1.rows[p1.rows.length - 1].id)

    const dues = p1.rows.map((r) => new Date(r.dueDate).getTime())
    expect([...dues].sort((a, b) => a - b)).toEqual(dues)

    const p3 = await listReceivables(ctx, base.clinicAId, undefined, {
      take: PAGE,
      cursor: (
        await listReceivables(ctx, base.clinicAId, undefined, {
          take: PAGE,
          cursor: p1.nextCursor!,
        })
      ).nextCursor!,
    })
    expect(p3.rows).toHaveLength(TOTAL - 2 * PAGE)
    expect(p3.hasMore).toBe(false)
    expect(p3.nextCursor).toBeNull()
  })
})
