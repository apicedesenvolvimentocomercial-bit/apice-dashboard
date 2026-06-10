import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 3.2 do plano de correções: a série de 12 meses do dashboard admin passou de
 * findMany-da-org-inteira+soma-em-JS para GROUP BY mensal NO BANCO. Este teste
 * prova a equivalência semântica — inclusive a conversão de fuso (UTC→SP) que
 * o monthKey fazia em memória.
 */

const session = vi.hoisted(() => ({
  user: {
    id: 'user-admin-test',
    organizationId: '',
    role: 'ADMIN',
    clientId: null,
    clinicRoleId: null,
  },
}))

vi.mock('@/server/auth', () => ({
  auth: async () => session,
  handlers: {},
  signIn: async () => {},
  signOut: async () => {},
}))

import { prisma } from '@/lib/prisma'
import { getAdminDashboard } from '@/server/queries/dashboard-queries'

import {
  assertTestDatabase,
  disconnectAdmin,
  getAdminPrisma,
  resetDb,
  seedBaseline,
  type Baseline,
} from './db'

describe('getAdminDashboard — série mensal agregada no banco', () => {
  let base: Baseline

  beforeAll(async () => {
    assertTestDatabase()
    await resetDb()
    base = await seedBaseline()
    session.user.organizationId = base.organizationId

    const admin = getAdminPrisma()
    const mkRevenue = (date: Date, amount: number) =>
      admin.revenue.create({
        data: {
          organizationId: base.organizationId,
          clientId: base.clinicAId,
          grossAmount: amount,
          discount: 0,
          amount,
          date,
        },
      })

    const now = new Date()
    // (a) Mês corrente: 100 + 200 (duas clínicas? mesma clínica, soma simples).
    await mkRevenue(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12)), 100)
    await mkRevenue(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 16, 12)), 200)
    // (b) Mesmo mês do ANO ANTERIOR: 50 → previousYear do bucket corrente.
    await mkRevenue(new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 15, 12)), 50)
    // (c) Borda de fuso: dia 1º do mês corrente às 01:00 UTC = 22:00 SP do
    //     ÚLTIMO dia do mês ANTERIOR → precisa cair no bucket do mês anterior.
    await mkRevenue(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 1)), 7)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('soma por mês em SP: valores no bucket certo, ano anterior alinhado, borda de fuso correta', async () => {
    const data = await getAdminDashboard('month')
    const series = data.revenueByMonth
    expect(series).toHaveLength(12)

    const current = series[series.length - 1]
    expect(current.revenue).toBe(300) // (a)
    expect(current.previousYear).toBe(50) // (b)

    const previous = series[series.length - 2]
    expect(previous.revenue).toBe(7) // (c) borda UTC→SP
  })
})
