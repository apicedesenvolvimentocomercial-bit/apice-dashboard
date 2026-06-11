import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { prisma } from '@/lib/prisma'
import { metricLabel, PERIOD_LABEL, type GoalPeriodKey } from '@/shared/goal-labels'
import type { TenantContext } from '@/server/tenant/context'

/**
 * Fonte ÚNICA dos datasets de exportação da clínica (aba Exportações + rota
 * `/api/export/[clientId]/[resource]`). Cada recurso declara o MÓDULO de
 * permissão de origem — a rota exige `module:read` e a página esconde o card
 * sem ele. O chamador é responsável por `assertClientAccess` +
 * `enterClientScope` ANTES (regra de ouro de tenant/RLS).
 *
 * Formatos servidos pela rota: CSV (BOM UTF-8, abre direto no Excel) e XLSX
 * (exceljs). Os valores saem PRONTOS p/ leitura humana (datas dd/MM/yyyy,
 * moeda com vírgula, enums com rótulo PT) — padrão de mercado p/ export de
 * dados operacionais.
 */

export type ExportResourceKey =
  | 'leads'
  | 'patients'
  | 'appointments'
  | 'revenues'
  | 'costs'
  | 'receivables'
  | 'procedures'
  | 'activities'
  | 'goals'

export type ExportResourceDef = {
  key: ExportResourceKey
  /** Módulo de permissão exigido (read). */
  module: string
  label: string
  description: string
  /** Base do nome do arquivo (sem extensão/data). */
  filenameBase: string
  /** Aceita filtro de período (from/to)? */
  supportsRange: boolean
}

export const EXPORT_RESOURCES: ExportResourceDef[] = [
  {
    key: 'leads',
    module: 'crm',
    label: 'Leads',
    description: 'Funil comercial: contato, origem, etapa e valor estimado',
    filenameBase: 'leads',
    supportsRange: true,
  },
  {
    key: 'patients',
    module: 'patients',
    label: 'Pacientes',
    description: 'Cadastro completo com contato e histórico de visitas',
    filenameBase: 'pacientes',
    supportsRange: false,
  },
  {
    key: 'appointments',
    module: 'appointments',
    label: 'Agendamentos',
    description: 'Agenda com paciente, procedimento, status e desfecho',
    filenameBase: 'agendamentos',
    supportsRange: true,
  },
  {
    key: 'revenues',
    module: 'financial',
    label: 'Receitas',
    description: 'Faturamento por competência com paciente e procedimento',
    filenameBase: 'receitas',
    supportsRange: true,
  },
  {
    key: 'costs',
    module: 'financial',
    label: 'Despesas',
    description: 'Custos por tipo e categoria (buckets da DRE)',
    filenameBase: 'custos',
    supportsRange: true,
  },
  {
    key: 'receivables',
    module: 'financial',
    label: 'Contas a receber',
    description: 'Parcelas com vencimento, status e data de pagamento',
    filenameBase: 'contas-a-receber',
    supportsRange: true,
  },
  {
    key: 'procedures',
    module: 'procedures',
    label: 'Procedimentos',
    description: 'Catálogo com preço, custo, duração e recorrência',
    filenameBase: 'procedimentos',
    supportsRange: false,
  },
  {
    key: 'activities',
    module: 'activities',
    label: 'Atividades',
    description: 'Tarefas internas com status, prioridade e responsável',
    filenameBase: 'atividades',
    supportsRange: true,
  },
  {
    key: 'goals',
    module: 'goals',
    label: 'Metas',
    description: 'Metas por métrica, período e escopo (clínica/cargo/pessoa)',
    filenameBase: 'metas',
    supportsRange: false,
  },
]

export const EXPORT_RESOURCE_BY_KEY = new Map(EXPORT_RESOURCES.map((r) => [r.key, r]))

export type ExportDataset = {
  headers: string[]
  rows: (string | number)[][]
}

export type ExportRange = { from?: Date; to?: Date }

// ----- formatação -----

function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR })
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return ''
  return format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR })
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return ''
  return v.toFixed(2).replace('.', ',')
}

function dateFilter(field: string, range?: ExportRange) {
  if (!range?.from && !range?.to) return {}
  return {
    [field]: {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    },
  }
}

// ----- rótulos PT (espelham os enums do Prisma) -----

const COST_TYPE_LABELS: Record<string, string> = {
  FIXED: 'Fixo',
  VARIABLE: 'Variável',
  MARKETING: 'Marketing',
  PAYROLL: 'Folha',
  TAX_REVENUE: 'Imposto s/ receita',
  TAX_PROFIT: 'Imposto s/ lucro',
  COMMISSION: 'Comissão',
  COMMERCIAL: 'Despesa comercial',
  ADMINISTRATIVE: 'Despesa administrativa',
  FINANCIAL_EXPENSE: 'Despesa financeira',
  OTHER: 'Outro',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão crédito',
  DEBIT_CARD: 'Cartão débito',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
}

const LEAD_SOURCE_LABELS: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  ORGANIC: 'Orgânico',
  REFERRAL: 'Indicação',
  WHATSAPP: 'WhatsApp',
  WALK_IN: 'Walk-in',
  OTHER: 'Outros',
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  ATTENDED: 'Compareceu',
  NO_SHOW: 'Faltou',
  CANCELED: 'Cancelado',
  RESCHEDULED: 'Remarcado',
}

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  PERDIDO: 'Perdido (baixa)',
  CANCELADO: 'Cancelado',
}

const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
}

const ACTIVITY_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

const GOAL_SCOPE_LABELS: Record<string, string> = {
  CLINIC: 'Clínica',
  USER: 'Pessoa',
  ROLE: 'Cargo',
}

// ----- datasets -----

export async function buildExportDataset(
  ctx: TenantContext,
  clientId: string,
  resource: ExportResourceKey,
  range?: ExportRange
): Promise<ExportDataset> {
  const base = { organizationId: ctx.organizationId, clientId, deletedAt: null }

  switch (resource) {
    case 'revenues': {
      const rows = await prisma.revenue.findMany({
        where: { ...base, ...dateFilter('date', range) },
        orderBy: { date: 'desc' },
        include: {
          patient: { select: { name: true } },
          procedure: { select: { name: true } },
        },
      })
      return {
        headers: [
          'Data',
          'Valor bruto (R$)',
          'Desconto (R$)',
          'Valor líquido (R$)',
          'Descrição',
          'Forma de pagamento',
          'Parcelas',
          'Paciente',
          'Procedimento',
        ],
        rows: rows.map((r) => [
          fmtDate(r.date),
          fmtMoney(Number(r.grossAmount)),
          fmtMoney(Number(r.discount)),
          fmtMoney(Number(r.amount)),
          r.description ?? '',
          PAYMENT_METHOD_LABELS[r.paymentMethod ?? ''] ?? r.paymentMethod ?? '',
          r.installments ?? 1,
          r.patient?.name ?? '',
          r.procedure?.name ?? '',
        ]),
      }
    }

    case 'costs': {
      const rows = await prisma.cost.findMany({
        where: { ...base, ...dateFilter('date', range) },
        orderBy: { date: 'desc' },
      })
      return {
        headers: ['Data', 'Tipo', 'Categoria', 'Valor (R$)', 'Descrição', 'Recorrente'],
        rows: rows.map((r) => [
          fmtDate(r.date),
          COST_TYPE_LABELS[r.type] ?? r.type,
          r.category ?? '',
          fmtMoney(Number(r.amount)),
          r.description ?? '',
          r.isRecurring ? 'Sim' : 'Não',
        ]),
      }
    }

    case 'receivables': {
      // Receivable não tem deletedAt próprio — herda a vida da Revenue.
      const rows = await prisma.receivable.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          revenue: { deletedAt: null },
          ...dateFilter('dueDate', range),
        },
        orderBy: { dueDate: 'desc' },
        include: {
          revenue: {
            select: {
              description: true,
              installments: true,
              patient: { select: { name: true } },
            },
          },
        },
      })
      return {
        headers: [
          'Vencimento',
          'Parcela',
          'Valor (R$)',
          'Status',
          'Pago em',
          'Forma de pagamento',
          'Paciente',
          'Descrição da receita',
        ],
        rows: rows.map((r) => [
          fmtDate(r.dueDate),
          `${r.installmentNumber}/${r.revenue.installments ?? 1}`,
          fmtMoney(Number(r.amount)),
          RECEIVABLE_STATUS_LABELS[r.status] ?? r.status,
          fmtDate(r.paidAt),
          PAYMENT_METHOD_LABELS[r.paymentMethod ?? ''] ?? r.paymentMethod ?? '',
          r.revenue.patient?.name ?? '',
          r.revenue.description ?? '',
        ]),
      }
    }

    case 'leads': {
      const rows = await prisma.lead.findMany({
        where: { ...base, ...dateFilter('createdAt', range) },
        orderBy: { createdAt: 'desc' },
        include: { stage: { select: { name: true, pipeline: { select: { name: true } } } } },
      })
      return {
        headers: [
          'Nome',
          'Telefone',
          'Email',
          'Origem',
          'Funil',
          'Etapa',
          'Procedimento de interesse',
          'Valor estimado (R$)',
          'Motivo de perda',
          'Criado em',
          'Fechado em',
        ],
        rows: rows.map((r) => [
          r.name,
          r.phone ?? '',
          r.email ?? '',
          LEAD_SOURCE_LABELS[r.source] ?? r.source,
          r.stage.pipeline.name,
          r.stage.name,
          r.procedureInterest ?? '',
          r.estimatedValue ? fmtMoney(Number(r.estimatedValue)) : '',
          r.lostReason ?? '',
          fmtDate(r.createdAt),
          fmtDate(r.closedAt),
        ]),
      }
    }

    case 'patients': {
      const rows = await prisma.patient.findMany({
        where: base,
        orderBy: { name: 'asc' },
      })
      return {
        headers: [
          'Nome',
          'Telefone',
          'Email',
          'Data de nascimento',
          'Primeira visita',
          'Última visita',
          'Retorno previsto',
          'Cadastrado em',
        ],
        rows: rows.map((r) => [
          r.name,
          r.phone ?? '',
          r.email ?? '',
          fmtDate(r.birthDate),
          fmtDate(r.firstVisitAt),
          fmtDate(r.lastVisitAt),
          fmtDate(r.nextReturnDueAt),
          fmtDate(r.createdAt),
        ]),
      }
    }

    case 'appointments': {
      const rows = await prisma.appointment.findMany({
        where: { ...base, ...dateFilter('scheduledAt', range) },
        orderBy: { scheduledAt: 'desc' },
        include: {
          patient: { select: { name: true } },
          procedure: { select: { name: true } },
        },
      })
      return {
        headers: [
          'Data',
          'Horário',
          'Paciente',
          'Procedimento',
          'Status',
          'Duração (min)',
          'Motivo de cancelamento',
        ],
        rows: rows.map((r) => [
          fmtDate(r.scheduledAt),
          format(new Date(r.scheduledAt), 'HH:mm'),
          r.patient.name,
          r.procedure.name,
          APPOINTMENT_STATUS_LABELS[r.status] ?? r.status,
          r.durationMinutes,
          r.cancelReason ?? '',
        ]),
      }
    }

    case 'procedures': {
      const rows = await prisma.procedure.findMany({
        where: base,
        orderBy: { name: 'asc' },
        include: { category: { select: { name: true } } },
      })
      return {
        headers: [
          'Nome',
          'Categoria',
          'Preço (R$)',
          'Custo (R$)',
          'Duração (min)',
          'Recorrência (dias)',
          'Ativo',
        ],
        rows: rows.map((r) => [
          r.name,
          r.category?.name ?? '',
          fmtMoney(Number(r.price)),
          fmtMoney(Number(r.cost)),
          r.durationMinutes ?? '',
          r.recurrenceDays ?? '',
          r.isActive ? 'Sim' : 'Não',
        ]),
      }
    }

    case 'activities': {
      const rows = await prisma.activity.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          domain: 'CLINIC',
          ...dateFilter('createdAt', range),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { name: true } },
          patient: { select: { name: true } },
          lead: { select: { name: true } },
        },
      })
      return {
        headers: [
          'Título',
          'Status',
          'Prioridade',
          'Vencimento',
          'Concluída em',
          'Responsável',
          'Paciente/Lead',
          'Criada em',
        ],
        rows: rows.map((r) => [
          r.title,
          ACTIVITY_STATUS_LABELS[r.status] ?? r.status,
          ACTIVITY_PRIORITY_LABELS[r.priority] ?? r.priority,
          fmtDateTime(r.dueDate),
          fmtDateTime(r.completedAt),
          r.assignedTo?.name ?? '',
          r.patient?.name ?? r.lead?.name ?? '',
          fmtDate(r.createdAt),
        ]),
      }
    }

    case 'goals': {
      const rows = await prisma.goal.findMany({
        where: base,
        orderBy: { endDate: 'desc' },
        include: {
          assigneeUser: { select: { name: true } },
          assigneeRole: { select: { name: true } },
        },
      })
      return {
        headers: ['Métrica', 'Período', 'Alvo', 'Início', 'Fim', 'Escopo', 'Atribuída a', 'Notas'],
        rows: rows.map((r) => [
          metricLabel(r.metric),
          PERIOD_LABEL[r.period as GoalPeriodKey] ?? r.period,
          fmtMoney(Number(r.targetValue)),
          fmtDate(r.startDate),
          fmtDate(r.endDate),
          GOAL_SCOPE_LABELS[r.scopeType] ?? r.scopeType,
          r.assigneeUser?.name ?? r.assigneeRole?.name ?? '',
          r.notes ?? '',
        ]),
      }
    }
  }
}
