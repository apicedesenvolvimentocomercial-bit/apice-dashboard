import { render } from '@react-email/render'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { prisma } from '@/lib/prisma'
import { resend, sendEmail } from '@/lib/resend'
import { logger } from '@/lib/logger'
import { computeClinicKpis } from '@/server/services/kpi/clinic-kpis'
import { resolvePeriod } from '@/server/services/kpi/period'
import { MonthlyReportEmail, buildKpiItems } from '@/emails/monthly-report-email'

const APP_URL =
  process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function runReportsJob(now: Date = new Date()) {
  const startedAt = Date.now()
  if (!resend) {
    logger.info('Reports job skipped — RESEND_API_KEY not set')
    return { skipped: true }
  }

  // Previous full month
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const range = resolvePeriod('custom', now, {
    from: format(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM-dd'),
    to: format(new Date(now.getFullYear(), now.getMonth(), 0), 'yyyy-MM-dd'),
  })
  const periodLabel = format(prevMonth, 'MMMM yyyy', { locale: ptBR })

  // All active clients with at least one CLIENT_OWNER user who has an email
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      organizationId: true,
      users: {
        where: { role: 'CLIENT_OWNER', isActive: true },
        select: { id: true, email: true, name: true },
      },
    },
  })

  let sent = 0
  let failed = 0

  for (const client of clients) {
    if (client.users.length === 0) continue

    try {
      const ctx = {
        organizationId: client.organizationId,
        role: 'ADMIN' as const,
        userId: 'cron',
        clientId: null,
        clinicRoleId: null,
      }
      const kpis = await computeClinicKpis(ctx, client.id, range)

      const kpiItems = buildKpiItems({
        totalRevenue: kpis.financial.totalRevenue,
        totalCosts: kpis.financial.totalCosts,
        netProfit: kpis.financial.netProfit,
        netMargin: kpis.financial.netMargin,
        leadsCount: kpis.commercial.leadsCount,
        conversionRate: kpis.commercial.conversionRate,
        noShowRate: kpis.commercial.noShowRate,
        averageTicket: kpis.financial.averageTicket,
      })

      const dashboardUrl = `${APP_URL}/clients/${client.id}/overview`
      const pdfUrl = `${APP_URL}/api/reports/${client.id}/pdf?from=${format(range.from, 'yyyy-MM-dd')}&to=${format(range.to, 'yyyy-MM-dd')}`

      const html = await render(
        MonthlyReportEmail({
          clinicName: client.name,
          period: periodLabel,
          kpis: kpiItems,
          dashboardUrl,
          pdfUrl,
        })
      )

      const to = client.users.map((u) => u.email)

      const emailRes = await sendEmail({
        to,
        subject: `Relatório mensal — ${client.name} (${periodLabel})`,
        html,
      })

      if (emailRes.ok) {
        sent++
        logger.info('Monthly report sent', { clientId: client.id, recipients: to.length })
      } else {
        failed++
        logger.error('Monthly report send failed', { clientId: client.id, error: emailRes.error })
      }
    } catch (err) {
      failed++
      logger.error('Monthly report send failed', {
        clientId: client.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('Reports job complete', { sent, failed, durationMs: Date.now() - startedAt })
  return { sent, failed }
}
