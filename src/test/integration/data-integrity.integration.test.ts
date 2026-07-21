import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/prisma'
import { runOutsideClientScope } from '@/server/tenant/client-scope'
import { runRecurringCostsJob } from '@/server/jobs/recurring-costs-job'

import {
  assertTestDatabase,
  disconnectAdmin,
  getAdminPrisma,
  resetDb,
  seedBaseline,
  type Baseline,
} from './db'

/**
 * Fase 2 — cluster de integridade de dados:
 * - H1: custos recorrentes não duplicam nem sob execuções CONCORRENTES
 *   (unique (recurringSourceId, recurringMonthKey) no banco, não check-then-act).
 * - I1: soft-delete não bloqueia recriação com o mesmo nome/key (unique parcial).
 * - J1: a invariante organizationId == client.organizationId é enforçada PELO
 *   BANCO (FK composta), não só por convenção de código.
 */
describe('integridade de dados (H1/I1/J1)', () => {
  let base: Baseline

  beforeAll(async () => {
    assertTestDatabase()
    await resetDb()
    base = await seedBaseline()
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('H1: duas execuções concorrentes do cron geram UM custo por template/mês', async () => {
    const admin = getAdminPrisma()
    // Template cadastrado num mês ANTERIOR: a linha do template já é a "baixa" do
    // mês em que nasceu, então o cron só materializa filhos a partir do mês
    // seguinte. Datando 60 dias atrás garantimos que o mês corrente PRECISA de um
    // filho — é isso que a concorrência abaixo dedup-a para exatamente 1.
    const template = await admin.cost.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        type: 'FIXED',
        category: 'Aluguel',
        amount: 3000,
        date: new Date(Date.now() - 60 * 86_400_000),
        isRecurring: true,
        recurringDay: 1,
      },
      select: { id: true },
    })

    await runOutsideClientScope(async () => {
      await Promise.all([runRecurringCostsJob(), runRecurringCostsJob()])
    })

    const children = await admin.cost.count({
      where: { recurringSourceId: template.id, deletedAt: null },
    })
    expect(children).toBe(1)

    // 3ª execução no mesmo mês: idempotente (skip pelo findFirst).
    const result = await runOutsideClientScope(() => runRecurringCostsJob())
    expect(result.created).toBe(0)
    expect(
      await admin.cost.count({ where: { recurringSourceId: template.id, deletedAt: null } })
    ).toBe(1)
  })

  it('I1: recriar categoria com o nome de uma soft-deletada funciona', async () => {
    const admin = getAdminPrisma()
    const cat = await admin.procedureCategory.create({
      data: { clientId: base.clinicAId, name: 'Facial' },
      select: { id: true },
    })
    await admin.procedureCategory.update({
      where: { id: cat.id },
      data: { deletedAt: new Date() },
    })

    // Antes da migration isto dava P2002 (o soft-deletado ocupava a chave).
    const recreated = await admin.procedureCategory.create({
      data: { clientId: base.clinicAId, name: 'Facial' },
      select: { id: true },
    })
    expect(recreated.id).not.toBe(cat.id)

    // Mas duas VIVAS com o mesmo nome continuam proibidas.
    await expect(
      admin.procedureCategory.create({ data: { clientId: base.clinicAId, name: 'Facial' } })
    ).rejects.toThrowError()
  })

  it('I1: recriar template com a key de um soft-deletado funciona', async () => {
    const admin = getAdminPrisma()
    const tpl = await admin.messageTemplate.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        key: 'custom.boas_vindas',
        body: 'Olá {{nome}}!',
      },
      select: { id: true },
    })
    await admin.messageTemplate.update({ where: { id: tpl.id }, data: { deletedAt: new Date() } })

    const recreated = await admin.messageTemplate.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        key: 'custom.boas_vindas',
        body: 'Olá de novo {{nome}}!',
      },
      select: { id: true },
    })
    expect(recreated.id).not.toBe(tpl.id)
  })

  it('J1: o banco rejeita write com organizationId que não é o do Client', async () => {
    const admin = getAdminPrisma()
    const otherOrg = await admin.organization.create({
      data: { name: 'Org Intrusa', slug: 'org-intrusa' },
      select: { id: true },
    })

    // organizationId de OUTRA org com clientId da clínica A → FK composta barra.
    await expect(
      admin.patient.create({
        data: {
          organizationId: otherOrg.id,
          clientId: base.clinicAId,
          name: 'Paciente Fantasma',
        },
      })
    ).rejects.toThrowError()

    // Controle: par correto continua funcionando.
    const ok = await admin.patient.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        name: 'Paciente Legítimo',
      },
      select: { id: true },
    })
    expect(ok.id).toBeTruthy()
  })
})
