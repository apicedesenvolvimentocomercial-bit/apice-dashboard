import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Retention-job — decisão D1 do plano de correções:
 * - Falha em UMA clínica não pode abortar as demais (try/catch por clínica,
 *   contador `errors` no resultado).
 * - Buckets calculados certos por idade da última visita × recorrência do
 *   procedimento, e idempotência (rodar 2× não duplica card nem toque).
 */

// Estado hoisted: o id da clínica que deve falhar só existe em runtime.
const failState = vi.hoisted(() => ({ clientId: '' }))

vi.mock('@/server/repositories/pipeline-repository', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/server/repositories/pipeline-repository')>()
  return {
    ...mod,
    ensureNativePipelines: async (clientId: string, organizationId: string) => {
      if (clientId === failState.clientId) throw new Error('boom clínica corrompida')
      return mod.ensureNativePipelines(clientId, organizationId)
    },
  }
})

import { prisma } from '@/lib/prisma'
import { runOutsideClientScope } from '@/server/tenant/client-scope'
import { runRetentionJob } from '@/server/jobs/retention-job'

import {
  assertTestDatabase,
  disconnectAdmin,
  getAdminPrisma,
  resetDb,
  seedBaseline,
  type Baseline,
} from './db'

const DAY_MS = 24 * 60 * 60 * 1000

describe('retention-job (isolamento de falha + buckets)', () => {
  let base: Baseline

  /** Paciente com 1 consulta ATTENDED há `daysAgo` dias na clínica B. */
  async function seedAttendedPatient(
    name: string,
    daysAgo: number,
    procedure: { id: string }
  ): Promise<string> {
    const admin = getAdminPrisma()
    const attendedAt = new Date(Date.now() - daysAgo * DAY_MS)
    const patient = await admin.patient.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicBId,
        name,
        phone: '+5511988887777',
        lastVisitAt: attendedAt,
      },
      select: { id: true },
    })
    await admin.appointment.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicBId,
        patientId: patient.id,
        procedureId: procedure.id,
        procedureIds: [procedure.id],
        scheduledAt: attendedAt,
        durationMinutes: 60,
        status: 'ATTENDED',
        attendedAt,
      },
    })
    return patient.id
  }

  beforeAll(async () => {
    assertTestDatabase()
    await resetDb()
    base = await seedBaseline()

    const admin = getAdminPrisma()
    // Procedimento com janela de retorno de 30 dias na clínica B.
    const proc = await admin.procedure.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicBId,
        name: 'Limpeza de pele',
        price: 200,
        cost: 50,
        recurrenceDays: 30,
      },
      select: { id: true },
    })

    // 4 pacientes em idades distintas → 4 buckets distintos (winbackDays=120 default).
    await seedAttendedPatient('Paciente PostCare', 0, proc) // ≤1d → POST_CARE
    await seedAttendedPatient('Paciente Nurture', 5, proc) // ≤15d → NURTURE
    await seedAttendedPatient('Paciente Reactivation', 40, proc) // > 30d ≤120d → REACTIVATION
    await seedAttendedPatient('Paciente Winback', 200, proc) // > 120d → WINBACK
  })

  afterAll(async () => {
    failState.clientId = ''
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  it('falha na clínica A não impede o processamento da clínica B', async () => {
    failState.clientId = base.clinicAId

    const result = await runOutsideClientScope(() => runRetentionJob())

    expect(result.errors).toBe(1)
    // Rede de segurança da B rodou: 4 pacientes ATTENDED viraram cards de retenção.
    expect(result.activated).toBe(4)

    const cards = await getAdminPrisma().lead.findMany({
      where: { clientId: base.clinicBId, deletedAt: null },
      select: { name: true, stage: { select: { nativeKey: true } } },
    })
    expect(cards).toHaveLength(4)
  })

  it('progressão posiciona cada card no bucket correto e cria os toques', async () => {
    failState.clientId = base.clinicAId
    // 2ª execução: os cards criados acima são progredidos para os buckets.
    await runOutsideClientScope(() => runRetentionJob())

    const cards = await getAdminPrisma().lead.findMany({
      where: { clientId: base.clinicBId, deletedAt: null },
      select: { name: true, stage: { select: { nativeKey: true } } },
    })
    const byName = new Map(cards.map((c) => [c.name, c.stage.nativeKey]))
    expect(byName.get('Paciente PostCare')).toBe('POST_CARE')
    expect(byName.get('Paciente Nurture')).toBe('NURTURE')
    expect(byName.get('Paciente Reactivation')).toBe('REACTIVATION')
    expect(byName.get('Paciente Winback')).toBe('WINBACK')

    // MANUAL (default): cada bucket com template vira tarefa + ledger TASK.
    const touches = await getAdminPrisma().outboundMessage.findMany({
      where: { clientId: base.clinicBId },
      select: { status: true, templateKey: true },
    })
    expect(touches).toHaveLength(4)
    expect(new Set(touches.map((t) => t.status))).toEqual(new Set(['TASK']))
    const tasks = await getAdminPrisma().activity.count({
      where: { clientId: base.clinicBId, domain: 'CLINIC', type: 'MESSAGE' },
    })
    expect(tasks).toBe(4)
  })

  it('é idempotente: rodar de novo não duplica card nem toque', async () => {
    failState.clientId = base.clinicAId
    await runOutsideClientScope(() => runRetentionJob())

    const cards = await getAdminPrisma().lead.count({
      where: { clientId: base.clinicBId, deletedAt: null },
    })
    const touches = await getAdminPrisma().outboundMessage.count({
      where: { clientId: base.clinicBId },
    })
    const tasks = await getAdminPrisma().activity.count({
      where: { clientId: base.clinicBId, domain: 'CLINIC', type: 'MESSAGE' },
    })
    expect(cards).toBe(4)
    expect(touches).toBe(4)
    expect(tasks).toBe(4)
  })
})
