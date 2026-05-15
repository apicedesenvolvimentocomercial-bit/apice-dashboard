import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { format } from 'date-fns'
import React from 'react'

import { auth } from '@/server/auth'
import { getTenantContext, assertClientAccess } from '@/server/tenant/context'
import { prisma } from '@/lib/prisma'
import { computeClinicKpis } from '@/server/services/kpi/clinic-kpis'
import { resolvePeriod } from '@/server/services/kpi/period'
import {
  getTopProceduresByRevenue,
  getTopCostCategories,
  getMonthlyRevenueCostData,
} from '@/server/repositories/revenue-repository'
import { ClinicReportPdf } from '@/server/services/report/clinic-pdf'

export const dynamic = 'force-dynamic'

type Params = { clientId: string }

export async function GET(req: Request, { params }: { params: Promise<Params> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId } = await params

  try {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)

    const url = new URL(req.url)
    const fromStr = url.searchParams.get('from')
    const toStr = url.searchParams.get('to')
    const period = fromStr && toStr ? 'custom' : 'month'
    const range = resolvePeriod(period, new Date(), {
      from: fromStr ?? undefined,
      to: toStr ?? undefined,
    })

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { name: true, healthScore: true },
    })
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [kpis, topProcedures, topCostCats, monthlyData, insightsOpen, goals] = await Promise.all([
      computeClinicKpis(ctx, clientId, range),
      getTopProceduresByRevenue(ctx, clientId, { from: range.from, to: range.to, limit: 8 }),
      getTopCostCategories(ctx, clientId, { from: range.from, to: range.to, limit: 5 }),
      getMonthlyRevenueCostData(ctx, clientId, 8),
      prisma.insight.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: { title: true, severity: true },
      }),
      prisma.goal.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          endDate: { gte: new Date() },
        },
        orderBy: { endDate: 'asc' },
        take: 6,
      }),
    ])

    const goalsProgress = await Promise.all(
      goals.map(async (g) => {
        const target = Number(g.targetValue)
        let current = 0
        const dateRange = { gte: g.startDate, lte: g.endDate }
        switch (g.metric) {
          case 'REVENUE': {
            const r = await prisma.revenue.aggregate({
              where: {
                organizationId: ctx.organizationId,
                clientId,
                deletedAt: null,
                date: dateRange,
              },
              _sum: { amount: true },
            })
            current = Number(r._sum.amount ?? 0)
            break
          }
          case 'LEADS':
            current = await prisma.lead.count({
              where: {
                organizationId: ctx.organizationId,
                clientId,
                deletedAt: null,
                createdAt: dateRange,
              },
            })
            break
          case 'APPOINTMENTS':
            current = await prisma.appointment.count({
              where: {
                organizationId: ctx.organizationId,
                clientId,
                deletedAt: null,
                scheduledAt: dateRange,
              },
            })
            break
          case 'NEW_PATIENTS':
            current = await prisma.patient.count({
              where: {
                organizationId: ctx.organizationId,
                clientId,
                deletedAt: null,
                createdAt: dateRange,
              },
            })
            break
        }
        const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 0
        return { metric: g.metric, progressPct, targetValue: target, currentValue: current }
      })
    )

    const revenueByMonth = monthlyData.map((m) => ({
      month: m.month,
      revenue: m.revenue,
      costs: m.costs,
    }))

    const pdfElement = React.createElement(ClinicReportPdf, {
      data: {
        clinicName: client.name,
        period: { from: range.from, to: range.to },
        generatedAt: new Date(),
        kpis: {
          totalRevenue: kpis.financial.totalRevenue,
          totalCosts: kpis.financial.totalCosts,
          netProfit: kpis.financial.netProfit,
          netMargin: kpis.financial.netMargin,
          leadsCount: kpis.commercial.leadsCount,
          appointmentsCount: kpis.commercial.appointmentsCount,
          conversionRate: kpis.commercial.conversionRate,
          noShowRate: kpis.commercial.noShowRate,
          averageTicket: kpis.financial.averageTicket ?? 0,
          healthScore: client.healthScore,
        },
        revenueByMonth,
        topProcedures: topProcedures.map((p) => ({ name: p.name, total: p.total, count: p.count })),
        topCostCategories: topCostCats.map((c) => ({ label: c.label, total: c.total })),
        insightsOpen: insightsOpen.map((i) => ({ title: i.title, severity: i.severity })),
        goalsProgress,
      },
    })
    // @react-pdf/renderer renderToStream expects DocumentProps element; cast needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(pdfElement as any)

    const slug = client.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const filename = `relatorio-${slug}-${format(new Date(), 'yyyy-MM-dd')}.pdf`

    const chunks: Uint8Array[] = []
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[PDF Report]', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
