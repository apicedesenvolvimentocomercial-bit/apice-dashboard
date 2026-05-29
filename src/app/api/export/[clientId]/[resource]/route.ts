import { NextResponse } from 'next/server'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { auth } from '@/server/auth'
import { getTenantContext, assertClientAccess } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { ForbiddenError } from '@/types/errors'

export const dynamic = 'force-dynamic'

const UTF8_BOM = '﻿'

function escapeCsv(value: unknown): string {
  let str = value == null ? '' : String(value)
  // CSV/formula injection: célula iniciada por = + - @ (ou TAB/CR) é executada
  // como fórmula por Excel/Sheets. Como parte do conteúdo vem de input do usuário
  // (nome de lead via webhook, descrições), prefixa com aspa simples p/ neutralizar.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const head = headers.map(escapeCsv).join(',')
  const body = rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
  return UTF8_BOM + head + '\n' + body
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return ''
  return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR })
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return ''
  return v.toFixed(2).replace('.', ',')
}

const COST_TYPE_LABELS: Record<string, string> = {
  FIXED: 'Fixo',
  VARIABLE: 'Variável',
  MARKETING: 'Marketing',
  PAYROLL: 'Folha',
  TAX: 'Imposto',
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

type Params = { clientId: string; resource: string }

export async function GET(req: Request, { params }: { params: Promise<Params> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, resource } = await params

  try {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    // Ativa a 2ª camada (RLS): injeta a GUC `app.current_client_id` em todas as
    // queries Prisma seguintes deste request (ver `prompt/rls-gambiarra.md`). Sem
    // isso a rota roda como contexto admin (GUC nula) e o isolamento desta clínica
    // dependeria só do `clientId` literal nos `where` abaixo.
    enterClientScope(clientId)

    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const dateFrom = from ? new Date(from) : undefined
    const dateTo = to ? new Date(to + 'T23:59:59') : undefined
    if (
      (dateFrom && Number.isNaN(dateFrom.getTime())) ||
      (dateTo && Number.isNaN(dateTo.getTime()))
    ) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    let csv = ''
    let filename = `export-${resource}-${format(new Date(), 'yyyy-MM-dd')}.csv`

    if (resource === 'revenues') {
      const rows = await prisma.revenue.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          ...(dateFrom || dateTo
            ? {
                date: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: { date: 'desc' },
        include: {
          patient: { select: { name: true } },
          procedure: { select: { name: true } },
        },
      })
      csv = toCsv(
        [
          'Data',
          'Valor (R$)',
          'Descrição',
          'Forma de Pagamento',
          'Parcelas',
          'Paciente',
          'Procedimento',
        ],
        rows.map((r) => [
          fmtDate(r.date),
          fmtMoney(Number(r.amount)),
          r.description ?? '',
          PAYMENT_METHOD_LABELS[r.paymentMethod ?? ''] ?? r.paymentMethod ?? '',
          r.installments ?? 1,
          r.patient?.name ?? '',
          r.procedure?.name ?? '',
        ])
      )
      filename = `receitas-${format(new Date(), 'yyyy-MM-dd')}.csv`
    } else if (resource === 'costs') {
      const rows = await prisma.cost.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          ...(dateFrom || dateTo
            ? {
                date: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: { date: 'desc' },
      })
      csv = toCsv(
        ['Data', 'Tipo', 'Categoria', 'Valor (R$)', 'Descrição', 'Recorrente'],
        rows.map((r) => [
          fmtDate(r.date),
          COST_TYPE_LABELS[r.type] ?? r.type,
          r.category ?? '',
          fmtMoney(Number(r.amount)),
          r.description ?? '',
          r.isRecurring ? 'Sim' : 'Não',
        ])
      )
      filename = `custos-${format(new Date(), 'yyyy-MM-dd')}.csv`
    } else if (resource === 'leads') {
      const rows = await prisma.lead.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          ...(dateFrom || dateTo
            ? {
                createdAt: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          stage: { select: { name: true } },
        },
      })
      csv = toCsv(
        [
          'Nome',
          'Telefone',
          'Email',
          'Origem',
          'Etapa',
          'Procedimento de Interesse',
          'Valor Estimado (R$)',
          'Criado em',
        ],
        rows.map((r) => [
          r.name,
          r.phone ?? '',
          r.email ?? '',
          LEAD_SOURCE_LABELS[r.source] ?? r.source,
          r.stage.name,
          r.procedureInterest ?? '',
          r.estimatedValue ? fmtMoney(Number(r.estimatedValue)) : '',
          fmtDate(r.createdAt),
        ])
      )
      filename = `leads-${format(new Date(), 'yyyy-MM-dd')}.csv`
    } else if (resource === 'patients') {
      const rows = await prisma.patient.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
        },
        orderBy: { name: 'asc' },
      })
      csv = toCsv(
        [
          'Nome',
          'Telefone',
          'Email',
          'Data de Nascimento',
          'Primeira Visita',
          'Última Visita',
          'Cadastrado em',
        ],
        rows.map((r) => [
          r.name,
          r.phone ?? '',
          r.email ?? '',
          fmtDate(r.birthDate),
          fmtDate(r.firstVisitAt),
          fmtDate(r.lastVisitAt),
          fmtDate(r.createdAt),
        ])
      )
      filename = `pacientes-${format(new Date(), 'yyyy-MM-dd')}.csv`
    } else if (resource === 'appointments') {
      const rows = await prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          ...(dateFrom || dateTo
            ? {
                scheduledAt: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: { scheduledAt: 'desc' },
        include: {
          patient: { select: { name: true } },
          procedure: { select: { name: true } },
        },
      })
      csv = toCsv(
        ['Data', 'Horário', 'Paciente', 'Procedimento', 'Status', 'Duração (min)'],
        rows.map((r) => [
          fmtDate(r.scheduledAt),
          format(new Date(r.scheduledAt), 'HH:mm'),
          r.patient.name,
          r.procedure.name,
          APPOINTMENT_STATUS_LABELS[r.status] ?? r.status,
          r.durationMinutes,
        ])
      )
      filename = `agendamentos-${format(new Date(), 'yyyy-MM-dd')}.csv`
    } else {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    logger.error('Export failed', {
      resource,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
