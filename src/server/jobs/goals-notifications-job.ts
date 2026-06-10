import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { metricLabel } from '@/shared/goal-labels'
import { getCurrentGoalValue } from '@/server/repositories/goal-repository'
import {
  dispatchNotification,
  getRecipientsForModule,
  type DispatchTarget,
} from '@/server/services/notification-service'

/**
 * Cron diário de METAS — ressuscita os tipos GOAL_AT_RISK / GOAL_ACHIEVED
 * (existiam no enum desde o início, mas nenhum código os disparava).
 *
 * Critérios:
 * - AT_RISK: ritmo abaixo do tempo — progresso mais de 15 p.p. atrás da fração
 *   do período já decorrida, com ≥25% do período andado (não grita no dia 1).
 *   Reaviso a cada 72h (dedupe) enquanto seguir em risco.
 * - ACHIEVED: progresso ≥ 100%. Dedupe = duração inteira do período (avisa 1×).
 *
 * Destinatários espelham o ESCOPO da meta (Etapa 2 de cargos):
 * - USER  → o próprio atribuído.
 * - ROLE INDIVIDUAL → cada membro avaliado pela PRÓPRIA produção (mesma cota).
 * - ROLE SHARED     → total da clínica; avisa todos os membros do cargo.
 * - CLINIC → titular + staff com `goals:read` (getRecipientsForModule).
 *
 * Métricas derivadas (CONVERSION_RATE/NO_SHOW_RATE/AVERAGE_TICKET) ficam fora:
 * `getCurrentGoalValue` ainda retorna 0 p/ elas (UI mostra "—") e avaliá-las
 * aqui geraria falso "em risco".
 */

const MEASURABLE_METRICS = new Set(['REVENUE', 'LEADS', 'APPOINTMENTS', 'NEW_PATIENTS'])
const AT_RISK_MIN_ELAPSED = 0.25
const AT_RISK_GAP = 0.15
const AT_RISK_DEDUPE_HOURS = 72

type JobTotals = { atRisk: number; achieved: number; emailed: number; errors: number }

type Evaluation = {
  targets: DispatchTarget[]
  current: number
  /** Sufixo do rótulo (nome do membro/cargo) p/ a mensagem. */
  who: string | null
}

export async function runGoalNotificationsJob(now: Date = new Date()): Promise<JobTotals> {
  const totals: JobTotals = { atRisk: 0, achieved: 0, emailed: 0, errors: 0 }

  const goals = await prisma.goal.findMany({
    where: {
      deletedAt: null,
      startDate: { lte: now },
      endDate: { gte: now },
      metric: { in: [...MEASURABLE_METRICS] as never },
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      metric: true,
      targetValue: true,
      startDate: true,
      endDate: true,
      scopeType: true,
      mode: true,
      assigneeUserId: true,
      assigneeRoleId: true,
      assigneeRole: { select: { name: true } },
    },
  })

  for (const g of goals) {
    try {
      const target = Number(g.targetValue)
      if (target <= 0) continue

      const evaluations = await evaluateGoal(g, now)
      const totalMs = g.endDate.getTime() - g.startDate.getTime()
      const elapsedRatio = totalMs > 0 ? (now.getTime() - g.startDate.getTime()) / totalMs : 1
      const daysLeft = Math.max(
        0,
        Math.ceil((g.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      )
      const periodHours = Math.max(24, Math.ceil(totalMs / 3_600_000))
      const label = metricLabel(g.metric)
      const link = `/goals?goal=${g.id}`

      for (const ev of evaluations) {
        if (ev.targets.length === 0) continue
        const progress = ev.current / target
        const who = ev.who ? ` (${ev.who})` : ''

        if (progress >= 1) {
          const r = await dispatchNotification(ev.targets, {
            type: 'GOAL_ACHIEVED',
            title: `Meta atingida: ${label}${who}`,
            message: `A meta de ${label.toLowerCase()}${who} chegou a ${Math.round(progress * 100)}% do alvo. Parabéns!`,
            link,
            metadata: { goalId: g.id, progress },
            dedupeWindowHours: periodHours,
          })
          totals.achieved += r.created
          totals.emailed += r.emailed
        } else if (elapsedRatio >= AT_RISK_MIN_ELAPSED && progress < elapsedRatio - AT_RISK_GAP) {
          const r = await dispatchNotification(ev.targets, {
            type: 'GOAL_AT_RISK',
            title: `Meta em risco: ${label}${who}`,
            message:
              `A meta de ${label.toLowerCase()}${who} está em ${Math.round(progress * 100)}% ` +
              `com ${Math.round(elapsedRatio * 100)}% do período decorrido` +
              (daysLeft > 0 ? ` — ${daysLeft} dia(s) restante(s).` : '.'),
            link,
            metadata: { goalId: g.id, progress, daysLeft },
            dedupeWindowHours: AT_RISK_DEDUPE_HOURS,
          })
          totals.atRisk += r.created
          totals.emailed += r.emailed
        }
      }
    } catch (err) {
      totals.errors++
      logger.error('goal notification failed', {
        goalId: g.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('Goal notifications job complete', totals)
  return totals
}

type GoalRow = {
  id: string
  organizationId: string
  clientId: string
  metric: string
  startDate: Date
  endDate: Date
  scopeType: string
  mode: string
  assigneeUserId: string | null
  assigneeRoleId: string | null
  assigneeRole: { name: string } | null
}

async function evaluateGoal(g: GoalRow, _now: Date): Promise<Evaluation[]> {
  const ctx = { organizationId: g.organizationId }

  if (g.scopeType === 'USER' && g.assigneeUserId) {
    const user = await prisma.user.findFirst({
      where: { id: g.assigneeUserId, isActive: true, deletedAt: null },
      select: { id: true, email: true, name: true },
    })
    if (!user) return []
    // INDIVIDUAL mede pela produção do atribuído; SHARED mede o total da clínica.
    const measureBy = g.mode === 'INDIVIDUAL' ? g.assigneeUserId : null
    const current = await getCurrentGoalValue(ctx, g.clientId, g, measureBy)
    return [
      {
        targets: [{ userId: user.id, email: user.email, name: user.name, clientId: g.clientId }],
        current,
        who: user.name,
      },
    ]
  }

  if (g.scopeType === 'ROLE' && g.assigneeRoleId) {
    const members = await prisma.user.findMany({
      where: {
        clientId: g.clientId,
        clinicRoleId: g.assigneeRoleId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, email: true, name: true },
    })
    if (members.length === 0) return []
    const roleName = g.assigneeRole?.name ?? 'Cargo'

    if (g.mode === 'INDIVIDUAL') {
      // Mesma cota por membro, progresso pelo autor (espelha goal-queries).
      const out: Evaluation[] = []
      for (const m of members) {
        const current = await getCurrentGoalValue(ctx, g.clientId, g, m.id)
        out.push({
          targets: [{ userId: m.id, email: m.email, name: m.name, clientId: g.clientId }],
          current,
          who: m.name,
        })
      }
      return out
    }

    const current = await getCurrentGoalValue(ctx, g.clientId, g)
    return [
      {
        targets: members.map((m) => ({
          userId: m.id,
          email: m.email,
          name: m.name,
          clientId: g.clientId,
        })),
        current,
        who: `${roleName} · equipe`,
      },
    ]
  }

  // CLINIC (coletiva): titular + quem tem goals:read no cargo.
  const targets = await getRecipientsForModule(g.organizationId, g.clientId, 'goals')
  const current = await getCurrentGoalValue(ctx, g.clientId, g)
  return [{ targets, current, who: null }]
}
