import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/prisma'
import { runOutsideClientScope } from '@/server/tenant/client-scope'
import { rebalanceStageLeads } from '@/server/repositories/lead-repository'
import { ensureNativePipelines } from '@/server/repositories/pipeline-repository'
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
 * Fase 4: quando a bissecção de posição esgota (posições empatadas/degeneradas),
 * o servidor renumera a coluna em passos de 1000 preservando a ordem pedida.
 */
describe('rebalanceStageLeads', () => {
  let base: Baseline
  let ctx: TenantContext
  let stageId: string
  const ids: Record<string, string> = {}

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
    await runOutsideClientScope(() => ensureNativePipelines(base.clinicAId, base.organizationId))
    const admin = getAdminPrisma()
    const stage = await admin.pipelineStage.findFirstOrThrow({
      where: { clientId: base.clinicAId, nativeKey: 'LEAD' },
      select: { id: true },
    })
    stageId = stage.id

    // Três cards com posição EMPATADA (estado degenerado pós-esgotamento).
    for (const name of ['A', 'B', 'C']) {
      const lead = await admin.lead.create({
        data: {
          organizationId: base.organizationId,
          clientId: base.clinicAId,
          name,
          source: 'OTHER',
          stageId,
          position: 1000,
        },
        select: { id: true },
      })
      ids[name] = lead.id
    }
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('renumera em passos de 1000 colocando o card antes do alvo', async () => {
    // Move C para ANTES de A (ordem final: C, A, B).
    const count = await runOutsideClientScope(() =>
      rebalanceStageLeads(ctx, base.clinicAId, stageId, ids.C, ids.A)
    )
    expect(count).toBe(3)

    const rows = await getAdminPrisma().lead.findMany({
      where: { stageId },
      orderBy: { position: 'asc' },
      select: { name: true, position: true },
    })
    expect(rows.map((r) => r.name)).toEqual(['C', 'A', 'B'])
    expect(rows.map((r) => r.position)).toEqual([1000, 2000, 3000]) // estritamente crescente
  })

  it('lead de outra etapa não renumera nada (belt)', async () => {
    const count = await runOutsideClientScope(() =>
      rebalanceStageLeads(ctx, base.clinicAId, stageId, 'lead-inexistente', null)
    )
    expect(count).toBe(0)
  })
})
