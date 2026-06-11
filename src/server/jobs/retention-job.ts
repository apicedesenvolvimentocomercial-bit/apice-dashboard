import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { monthBoundsFor, spDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { ensureNativePipelines } from '@/server/repositories/pipeline-repository'
import {
  getRetentionStageMap,
  removeActiveCommercialDuplicates,
  type RetentionStageKey,
} from '@/server/services/retention-service'
import {
  ensureDefaultMessageTemplates,
  enqueueMessage,
  renderTemplate,
  resolveTemplate,
  RETENTION_TEMPLATE_KEYS,
} from '@/server/services/message-service'
import {
  dispatchNotification,
  getRecipientsForModule,
} from '@/server/services/notification-service'

/**
 * Cron de retenção — CICLO DE VIDA DO PACIENTE (reforma — retencao-reforma-progresso.md).
 * Cross-clínica → contexto admin (GUC nula), exceção legítima de RLS. Por clínica:
 *
 *  1. Garante a pipeline RETENTION (5 etapas nativas) + templates default.
 *  2. MIGRAÇÃO: cards no "Fechado" comercial (fechados ANTES de hoje) entram na
 *     retenção na etapa de ENTRADA (Pós-procedimento). Remove duplicatas comerciais.
 *  3. Rede de segurança: pacientes que comparecerem, sem card de retenção e sem card
 *     comercial ativo → entram na retenção.
 *  4. PROGRESSÃO: cada card de retenção é reposicionado no BUCKET calculado por tempo
 *     desde a última visita + recorrência do procedimento, e a mensagem-template do
 *     bucket é enfileirada (idempotente por dedupeKey ancorado na última visita).
 *
 * Robustez/escala (plano de correções D1):
 * - `runRetentionForClient` processa UMA clínica com queries EM LOTE (última visita
 *   via DISTINCT ON, retorno futuro, contagens por groupBy, dedupe num `in`) —
 *   custo por clínica ~constante em queries, não O(cards).
 * - `runRetentionJob` isola falha POR CLÍNICA (try/catch + contador `errors`):
 *   uma clínica corrompida não interrompe as demais.
 * - `runRetentionForClientId` é o entrypoint do fan-out (Inngest: 1 evento por
 *   clínica, cada uma na própria invocação).
 *
 * Idempotente: rodar de novo não duplica card nem mensagem.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const BUCKET_TEMPLATE: Partial<Record<RetentionStageKey, string>> = {
  POST_CARE: RETENTION_TEMPLATE_KEYS.POST_CARE,
  NURTURE: RETENTION_TEMPLATE_KEYS.NURTURE,
  REACTIVATION: RETENTION_TEMPLATE_KEYS.REACTIVATION,
  WINBACK: RETENTION_TEMPLATE_KEYS.WINBACK,
  // LOYALTY: sem mensagem — paciente recorrente comprometido (não precisa de cutucão).
}

const STAGE_LABEL: Record<RetentionStageKey, string> = {
  POST_CARE: 'Pós-procedimento',
  NURTURE: 'Nutrição',
  REACTIVATION: 'Reativação',
  LOYALTY: 'Fidelização',
  WINBACK: 'Salvamento',
}

/**
 * Modo MANUAL: o toque da régua vira uma ATIVIDADE atrelada ao paciente (o time
 * envia à mão). domain CLINIC, type MESSAGE, sem responsável (global). A descrição
 * já traz a mensagem sugerida (template renderizado) + o contato. Grava também uma
 * linha no ledger `OutboundMessage` (status TASK) p/ idempotência — não recria a
 * tarefa toda noite.
 */
async function createRetentionTask(params: {
  organizationId: string
  clientId: string
  patientId: string
  bucket: RetentionStageKey
  templateKey: string
  vars: Record<string, string>
  phone: string | null
  dedupeKey: string
}): Promise<void> {
  const { organizationId, clientId, patientId, bucket, templateKey, vars, phone, dedupeKey } =
    params
  const tpl = await resolveTemplate(clientId, templateKey)
  const body = tpl ? renderTemplate(tpl.body, vars) : ''
  const description =
    (body ? body + '\n\n' : '') +
    (phone ? `Contato: ${phone}` : 'Paciente sem telefone cadastrado.')

  await prisma.activity.create({
    data: {
      organizationId,
      clientId,
      domain: 'CLINIC',
      type: 'MESSAGE',
      title: `${STAGE_LABEL[bucket]}: contatar ${vars.nome}`,
      description,
      status: 'PENDING',
      priority: 'MEDIUM',
      patientId,
      dueDate: new Date(),
    },
  })
  await prisma.outboundMessage.create({
    data: {
      organizationId,
      clientId,
      patientId,
      channel: 'WHATSAPP',
      templateKey,
      payload: { ...vars, to: phone ?? '' },
      status: 'TASK',
      dedupeKey,
    },
  })
}

export type BucketInput = {
  now: Date
  lastVisitAt: Date | null
  /** Janela recomendada de retorno (recurrenceDays do procedimento ou fallback). */
  returnWindowDays: number
  hasFutureAppt: boolean
  isRecurrent: boolean
  winbackDays: number
}

/** Decide o bucket de retenção (função pura — testável). Ver regras no ledger. */
export function computeRetentionBucket(input: BucketInput): RetentionStageKey {
  const { now, lastVisitAt, returnWindowDays, hasFutureAppt, isRecurrent, winbackDays } = input
  if (!lastVisitAt) return 'NURTURE' // card sem visita registrada → estado neutro

  const daysSince = Math.floor((now.getTime() - lastVisitAt.getTime()) / DAY_MS)
  if (daysSince <= 1) return 'POST_CARE'
  if (hasFutureAppt && isRecurrent) return 'LOYALTY' // recorrente com retorno marcado
  if (daysSince <= 15) return 'NURTURE'
  if (daysSince <= returnWindowDays) return 'NURTURE' // ainda dentro da janela de retorno
  if (daysSince <= winbackDays) return 'REACTIVATION' // janela venceu, não remarcou
  return 'WINBACK' // inativo longo
}

export type RetentionClientRow = {
  id: string
  name: string
  organizationId: string
  inactivityDays: number
  winbackDays: number
  operationMode: 'MANUAL' | 'AUTOMATED'
}

/** Clínicas elegíveis à régua de retenção (consumido pelo loop e pelo fan-out). */
export async function listRetentionClients(): Promise<RetentionClientRow[]> {
  return prisma.client.findMany({
    where: { deletedAt: null, status: { not: 'INACTIVE' } },
    select: {
      id: true,
      name: true,
      organizationId: true,
      inactivityDays: true,
      winbackDays: true,
      operationMode: true,
    },
  })
}

export type RetentionClientResult = {
  migrated: number
  activated: number
  moved: number
  queued: number
  tasked: number
  /** Pacientes que ENTRARAM em Reativação/Salvamento nesta execução (avisados). */
  riskNotified: number
}

/** Processa a régua de retenção de UMA clínica (queries em lote — D1). */
export async function runRetentionForClient(
  client: RetentionClientRow,
  opts?: { now?: Date; whatsappEnabled?: boolean }
): Promise<RetentionClientResult> {
  const now = opts?.now ?? new Date()
  const whatsappEnabled = opts?.whatsappEnabled ?? env.WHATSAPP_API_ENABLED

  // Fronteira "hoje" no fuso de SP: fechados antes disso migram (= dia seguinte).
  const b = monthBoundsFor(now)
  const startOfTodaySP = spDate(b.year, b.month0, b.day, 0, 0, 0)

  const result: RetentionClientResult = {
    migrated: 0,
    activated: 0,
    moved: 0,
    queued: 0,
    tasked: 0,
    riskNotified: 0,
  }

  await ensureNativePipelines(client.id, client.organizationId)
  await ensureDefaultMessageTemplates(client.id, client.organizationId)

  // Envia mensagem só se a clínica escolheu AUTOMATED E o WhatsApp está integrado;
  // caso contrário, o toque vira atividade atrelada ao paciente.
  const automate = client.operationMode === 'AUTOMATED' && whatsappEnabled

  const stageMap = await getRetentionStageMap(client.id)
  const entryStageId = stageMap.POST_CARE ?? stageMap.NURTURE
  if (!entryStageId) return result

  // (2) Migração: Fechado (fechado antes de hoje) → entrada da retenção.
  const commercial = await prisma.pipeline.findFirst({
    where: { clientId: client.id, kind: 'COMMERCIAL' },
    select: { stages: { select: { id: true, nativeKey: true } } },
  })
  const closedStageId = commercial?.stages.find((s) => s.nativeKey === 'CLOSED')?.id
  if (closedStageId) {
    const closedLeads = await prisma.lead.findMany({
      where: {
        clientId: client.id,
        organizationId: client.organizationId,
        deletedAt: null,
        stageId: closedStageId,
        closedAt: { lt: startOfTodaySP },
      },
      select: { id: true, name: true, phone: true, email: true, patientId: true },
    })
    for (const lead of closedLeads) {
      await removeActiveCommercialDuplicates(client.id, client.organizationId, lead, lead.id)
      await prisma.lead.update({ where: { id: lead.id }, data: { stageId: entryStageId } })
      result.migrated++
    }
  }

  // (3) Rede de segurança: pacientes ATTENDED sem card de retenção e sem card
  // comercial ativo → entra na retenção.
  const completedPatients = await prisma.patient.findMany({
    where: {
      clientId: client.id,
      organizationId: client.organizationId,
      deletedAt: null,
      appointments: { some: { status: 'ATTENDED', deletedAt: null } },
      leads: {
        none: {
          deletedAt: null,
          OR: [
            { stage: { pipeline: { kind: 'RETENTION' } } },
            { stage: { pipeline: { kind: 'COMMERCIAL' }, isWon: false, isLost: false } },
          ],
        },
      },
    },
    select: { id: true, name: true, phone: true, email: true },
  })
  for (const p of completedPatients) {
    await prisma.lead.create({
      data: {
        organizationId: client.organizationId,
        clientId: client.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        source: 'WALK_IN',
        stageId: entryStageId,
        patientId: p.id,
      },
    })
    result.activated++
  }

  // (4) Progressão: reposiciona cada card no bucket calculado + enfileira mensagem.
  // Tudo em LOTE (D1): antes eram 4 queries POR CARD; agora ~5 por clínica.
  const cards = await prisma.lead.findMany({
    where: {
      clientId: client.id,
      deletedAt: null,
      patientId: { not: null },
      stage: { pipeline: { kind: 'RETENTION' } },
    },
    select: { id: true, stageId: true, patientId: true, name: true, phone: true },
  })
  if (cards.length === 0) return result

  const patientIds = [...new Set(cards.map((c) => c.patientId!).filter(Boolean))]

  const [lastVisits, futureAppts, attendedCounts, patientRows] = await Promise.all([
    // Última visita ATTENDED por paciente — DISTINCT ON (patientId) + attendedAt desc.
    prisma.appointment.findMany({
      where: {
        clientId: client.id,
        patientId: { in: patientIds },
        status: 'ATTENDED',
        deletedAt: null,
      },
      orderBy: [{ patientId: 'asc' }, { attendedAt: 'desc' }],
      distinct: ['patientId'],
      select: {
        patientId: true,
        attendedAt: true,
        procedure: { select: { name: true, recurrenceDays: true } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        clientId: client.id,
        patientId: { in: patientIds },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        scheduledAt: { gt: now },
        deletedAt: null,
      },
      distinct: ['patientId'],
      select: { patientId: true },
    }),
    prisma.appointment.groupBy({
      by: ['patientId'],
      where: {
        clientId: client.id,
        patientId: { in: patientIds },
        status: 'ATTENDED',
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, nextReturnDueAt: true },
    }),
  ])

  const lastVisitByPatient = new Map(lastVisits.map((v) => [v.patientId, v]))
  const hasFutureByPatient = new Set(futureAppts.map((f) => f.patientId))
  const attendedCountByPatient = new Map(attendedCounts.map((a) => [a.patientId, a._count._all]))
  const nextReturnByPatient = new Map(patientRows.map((p) => [p.id, p.nextReturnDueAt]))

  // Decide bucket + dedupeKey de todos os cards ANTES de checar o ledger (1 query).
  const plans = cards
    .filter((c) => c.patientId)
    .map((card) => {
      const patientId = card.patientId!
      const lastVisit = lastVisitByPatient.get(patientId)
      const lastVisitAt = lastVisit?.attendedAt ?? null
      const returnWindowDays = lastVisit?.procedure?.recurrenceDays ?? client.inactivityDays
      const bucket = computeRetentionBucket({
        now,
        lastVisitAt,
        returnWindowDays,
        hasFutureAppt: hasFutureByPatient.has(patientId),
        isRecurrent: (attendedCountByPatient.get(patientId) ?? 0) >= 2,
        winbackDays: client.winbackDays,
      })
      const templateKey = BUCKET_TEMPLATE[bucket]
      const anchor = lastVisitAt ? lastVisitAt.toISOString().slice(0, 10) : 'none'
      return {
        card,
        patientId,
        lastVisit,
        lastVisitAt,
        returnWindowDays,
        bucket,
        templateKey,
        dedupeKey: templateKey ? `ret:${patientId}:${bucket}:${anchor}` : null,
      }
    })

  const dedupeKeys = plans.map((p) => p.dedupeKey).filter((k): k is string => Boolean(k))
  const existingTouches = new Set(
    (
      await prisma.outboundMessage.findMany({
        where: { dedupeKey: { in: dedupeKeys } },
        select: { dedupeKey: true },
      })
    ).map((m) => m.dedupeKey!)
  )

  // Pacientes que ENTRARAM em risco nesta execução (Reativação/Salvamento) —
  // viram UM aviso agregado por clínica no fim (não 1 notificação por paciente).
  const riskEntries: { name: string; bucket: RetentionStageKey }[] = []

  for (const plan of plans) {
    const { card, patientId, lastVisit, lastVisitAt, returnWindowDays, bucket } = plan

    // Denorm do retorno esperado (UI): última visita + janela. Só escreve se mudou.
    const nextReturnDueAt = lastVisitAt
      ? new Date(lastVisitAt.getTime() + returnWindowDays * DAY_MS)
      : null
    const current = nextReturnByPatient.get(patientId)
    if (nextReturnDueAt?.getTime() !== (current?.getTime() ?? undefined)) {
      await prisma.patient.update({ where: { id: patientId }, data: { nextReturnDueAt } })
    }

    const targetStageId = stageMap[bucket]
    if (targetStageId && targetStageId !== card.stageId) {
      await prisma.lead.update({ where: { id: card.id }, data: { stageId: targetStageId } })
      result.moved++
      // Transição PARA bucket de risco = paciente acabou de "vencer" a janela.
      if (bucket === 'REACTIVATION' || bucket === 'WINBACK') {
        riskEntries.push({ name: card.name, bucket })
      }
    }

    // Toque do bucket (idempotente por dedupeKey ancorado na última visita — 1 por
    // bucket por ciclo de visita; LOYALTY não cutuca). AUTOMATED → enfileira
    // mensagem; MANUAL (ou WhatsApp off) → cria atividade atrelada ao paciente.
    if (plan.templateKey && plan.dedupeKey && !existingTouches.has(plan.dedupeKey)) {
      const vars = {
        nome: card.name.split(' ')[0] ?? card.name,
        procedimento: lastVisit?.procedure?.name ?? 'procedimento',
        clinica: client.name,
      }
      if (automate) {
        await enqueueMessage({
          organizationId: client.organizationId,
          clientId: client.id,
          patientId,
          templateKey: plan.templateKey,
          to: card.phone,
          vars,
          dedupeKey: plan.dedupeKey,
        })
        result.queued++
      } else {
        await createRetentionTask({
          organizationId: client.organizationId,
          clientId: client.id,
          patientId,
          bucket,
          templateKey: plan.templateKey,
          vars,
          phone: card.phone,
          dedupeKey: plan.dedupeKey,
        })
        result.tasked++
      }
    }
  }

  // CLIENT_INACTIVE (tipo existia no enum sem disparo): UM aviso agregado por
  // clínica p/ titular + cargo com `patients:read`. Best-effort — falha não
  // derruba a régua. Dedupe 20h cobre re-execução manual no mesmo dia (a
  // transição de bucket em si já é idempotente: o card só "entra" 1 vez).
  if (riskEntries.length > 0) {
    try {
      const targets = await getRecipientsForModule(client.organizationId, client.id, 'patients')
      if (targets.length > 0) {
        const names = riskEntries
          .slice(0, 5)
          .map((e) => e.name)
          .join(', ')
        const rest = riskEntries.length - 5
        await dispatchNotification(targets, {
          type: 'CLIENT_INACTIVE',
          title:
            riskEntries.length === 1
              ? '1 paciente precisa de reativação'
              : `${riskEntries.length} pacientes precisam de reativação`,
          message:
            `Fora da janela de retorno: ${names}${rest > 0 ? ` e mais ${rest}` : ''}. ` +
            'A régua de retenção já preparou o toque de cada um.',
          link: '/patients',
          metadata: { count: riskEntries.length },
          dedupeWindowHours: 20,
        })
        result.riskNotified = riskEntries.length
      }
    } catch (err) {
      logger.warn('Retention risk notification failed', {
        clientId: client.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

/** Entrypoint por id — usado pelo fan-out do Inngest (1 evento por clínica). */
export async function runRetentionForClientId(
  clientId: string
): Promise<RetentionClientResult | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null, status: { not: 'INACTIVE' } },
    select: {
      id: true,
      name: true,
      organizationId: true,
      inactivityDays: true,
      winbackDays: true,
      operationMode: true,
    },
  })
  if (!client) return null
  return runRetentionForClient(client)
}

export async function runRetentionJob() {
  const startedAt = Date.now()
  const clients = await listRetentionClients()
  const now = new Date()
  const whatsappEnabled = env.WHATSAPP_API_ENABLED

  const totals: RetentionClientResult & { errors: number } = {
    migrated: 0,
    activated: 0,
    moved: 0,
    queued: 0,
    tasked: 0,
    riskNotified: 0,
    errors: 0,
  }

  for (const client of clients) {
    try {
      const r = await runRetentionForClient(client, { now, whatsappEnabled })
      totals.migrated += r.migrated
      totals.activated += r.activated
      totals.moved += r.moved
      totals.queued += r.queued
      totals.tasked += r.tasked
      totals.riskNotified += r.riskNotified
    } catch (err) {
      // Isolamento por clínica (D1): registra e segue — uma clínica corrompida
      // não pode parar a régua das demais.
      totals.errors++
      logger.error('Retention job failed for clinic', {
        clientId: client.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const summary = { clients: clients.length, ...totals }
  logger.info('Retention job finished', { ...summary, durationMs: Date.now() - startedAt })
  return summary
}
