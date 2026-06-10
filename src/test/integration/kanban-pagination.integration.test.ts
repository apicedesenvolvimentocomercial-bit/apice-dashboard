import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/prisma'
import { runOutsideClientScope } from '@/server/tenant/client-scope'
import {
  getPipeline,
  KANBAN_CARDS_PAGE,
  listStageLeads,
  searchLeads,
} from '@/server/repositories/lead-repository'
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
 * M1 do plano de correções: o kanban deixou de carregar TODOS os cards
 * (a retenção tem 1 por paciente — payload sem teto). O SSR traz a 1ª página
 * (KANBAN_CARDS_PAGE) + total real; o resto vem por cursor; a busca global é
 * server-side (a antiga, em memória, só veria a 1ª página).
 */
describe('kanban paginado (M1)', () => {
  let base: Baseline
  let ctx: TenantContext
  let pipelineId: string
  let leadStageId: string

  const TOTAL = KANBAN_CARDS_PAGE + 10 // 60: 1 página cheia + resto

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
    const commercial = await admin.pipeline.findFirstOrThrow({
      where: { clientId: base.clinicAId, kind: 'COMMERCIAL' },
      select: { id: true, stages: { where: { nativeKey: 'LEAD' }, select: { id: true } } },
    })
    pipelineId = commercial.id
    leadStageId = commercial.stages[0].id

    await admin.lead.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        name: `Lead ${String(i + 1).padStart(3, '0')}`,
        phone: `+55119${String(70000000 + i)}`,
        source: 'OTHER' as const,
        stageId: leadStageId,
        position: (i + 1) * 1000,
      })),
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('SSR traz 1ª página limitada + total REAL da coluna', async () => {
    const stages = await runOutsideClientScope(() => getPipeline(ctx, base.clinicAId, pipelineId))
    const leadStage = stages.find((s) => s.id === leadStageId)!
    expect(leadStage.leads).toHaveLength(KANBAN_CARDS_PAGE)
    expect(leadStage.totalLeads).toBe(TOTAL)
    // Ordem estável por position.
    expect(leadStage.leads[0].name).toBe('Lead 001')
  })

  it('cursor percorre o resto sem buraco nem duplicata', async () => {
    const stages = await runOutsideClientScope(() => getPipeline(ctx, base.clinicAId, pipelineId))
    const firstPage = stages.find((s) => s.id === leadStageId)!.leads
    const cursor = firstPage[firstPage.length - 1].id

    const page2 = await runOutsideClientScope(() =>
      listStageLeads(ctx, base.clinicAId, leadStageId, { cursor })
    )
    expect(page2.rows).toHaveLength(TOTAL - KANBAN_CARDS_PAGE)
    expect(page2.hasMore).toBe(false)

    const ids = new Set([...firstPage.map((l) => l.id), ...page2.rows.map((l) => l.id)])
    expect(ids.size).toBe(TOTAL)
  })

  it('busca server-side acha card que está ALÉM da 1ª página', async () => {
    // Lead 060 é o último por position → fora da página de 50.
    const hits = await runOutsideClientScope(() =>
      searchLeads(ctx, base.clinicAId, 'Lead 060', null)
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].name).toBe('Lead 060')
    expect(hits[0].stage.pipeline.id).toBe(pipelineId)
  })
})
