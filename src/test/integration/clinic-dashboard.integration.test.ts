import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 2.6 do plano de correções: `getClinicDashboard` é LEITURA (cacheada) e não
 * pode ter efeito colateral — antes ela atualizava `Client.healthScore` a cada
 * render (write amplification + corrida com o snapshot noturno). A persistência
 * do score é exclusiva do snapshots-job.
 */

// Sessão fake (admin da org) — instalada antes dos imports (vi.mock é hoisted).
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
import { getClinicDashboard } from '@/server/queries/dashboard-queries'

import {
  assertTestDatabase,
  disconnectAdmin,
  getAdminPrisma,
  resetDb,
  seedBaseline,
  seedSessionUser,
  type Baseline,
} from './db'

describe('getClinicDashboard (leitura sem efeito colateral)', () => {
  let base: Baseline

  beforeAll(async () => {
    assertTestDatabase()
    await resetDb()
    base = await seedBaseline()
    session.user.organizationId = base.organizationId
    await seedSessionUser(session.user.id, base.organizationId)

    const admin = getAdminPrisma()
    // Receita + custo no mês corrente → healthScore computável (não-nulo).
    await admin.revenue.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        grossAmount: 1000,
        discount: 0,
        amount: 1000,
        date: new Date(),
        type: 'PROCEDIMENTO',
      },
    })
    await admin.cost.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        type: 'FIXED',
        amount: 200,
        date: new Date(),
      },
    })
    // Score persistido conhecido — o dashboard NÃO pode sobrescrevê-lo.
    await admin.client.update({ where: { id: base.clinicAId }, data: { healthScore: 42 } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('renderizar o dashboard NÃO escreve Client.healthScore', async () => {
    const data = await getClinicDashboard(base.clinicAId, 'month')
    expect(data.kpis.healthScore).not.toBeNull() // o valor VIVO continua na resposta

    const row = await getAdminPrisma().client.findUniqueOrThrow({
      where: { id: base.clinicAId },
      select: { healthScore: true },
    })
    expect(row.healthScore).toBe(42) // persistido intacto (só o snapshots-job escreve)
  })
})
