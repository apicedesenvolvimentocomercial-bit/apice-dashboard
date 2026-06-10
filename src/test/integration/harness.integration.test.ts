import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/prisma'
import { enterClientScope, runOutsideClientScope } from '@/server/tenant/client-scope'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'

import { assertTestDatabase, disconnectAdmin, resetDb, seedBaseline, type Baseline } from './db'

/**
 * Smoke test do harness de integração (Fase 0 do plano de correções).
 *
 * Prova que a fundação funciona de ponta a ponta:
 * 1. reset + seed contra o Neon (.env.test);
 * 2. o client REAL do app (com a extensão de RLS) lê/escreve;
 * 3. `enterClientScope` ativa o isolamento NO BANCO (findMany sem where só vê a
 *    clínica do escopo) — mesma garantia do `rls:check:ext`, agora disponível
 *    para qualquer teste de action/job das próximas fases;
 * 4. `scopedTransaction` mantém a GUC dentro de transação interativa.
 */
describe('harness de integração', () => {
  let base: Baseline

  beforeAll(async () => {
    assertTestDatabase()
    await resetDb()
    base = await seedBaseline()
    // Escreve pelo client do APP sem escopo (GUC nula = contexto admin → policy
    // libera): um paciente em cada clínica.
    await runOutsideClientScope(async () => {
      await prisma.patient.create({
        data: {
          organizationId: base.organizationId,
          clientId: base.clinicAId,
          name: 'Paciente Alpha (int)',
        },
      })
      await prisma.patient.create({
        data: {
          organizationId: base.organizationId,
          clientId: base.clinicBId,
          name: 'Paciente Bravo (int)',
        },
      })
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('sem escopo (admin): vê pacientes das duas clínicas', async () => {
    const names = await runOutsideClientScope(async () => {
      const rows = await prisma.patient.findMany({ select: { name: true } })
      return rows.map((r) => r.name)
    })
    expect(names).toContain('Paciente Alpha (int)')
    expect(names).toContain('Paciente Bravo (int)')
  })

  it('sob escopo da clínica A: findMany SEM where só retorna a clínica A', async () => {
    enterClientScope(base.clinicAId)
    const rows = await prisma.patient.findMany({ select: { name: true } })
    const names = rows.map((r) => r.name)
    expect(names).toContain('Paciente Alpha (int)')
    expect(names).not.toContain('Paciente Bravo (int)')
  })

  it('scopedTransaction sob escopo: escreve e lê isolado na mesma transação', async () => {
    enterClientScope(base.clinicAId)
    const visible = await scopedTransaction(async (tx) => {
      await tx.patient.create({
        data: {
          organizationId: base.organizationId,
          clientId: base.clinicAId,
          name: 'Paciente Alpha 2 (int)',
        },
      })
      const rows = await tx.patient.findMany({ select: { name: true } })
      return rows.map((r) => r.name)
    })
    expect(visible).toContain('Paciente Alpha 2 (int)')
    expect(visible).not.toContain('Paciente Bravo (int)')
  })

  it('escopo da clínica B não enxerga (nem altera) dados da A', async () => {
    enterClientScope(base.clinicBId)
    const updated = await prisma.patient.updateMany({
      where: { name: 'Paciente Alpha (int)' },
      data: { name: 'hackeado' },
    })
    expect(updated.count).toBe(0)
    const names = (await prisma.patient.findMany({ select: { name: true } })).map((r) => r.name)
    expect(names).toContain('Paciente Bravo (int)')
    expect(names).not.toContain('Paciente Alpha (int)')
  })
})
