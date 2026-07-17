import { NextResponse } from 'next/server'
import { format } from 'date-fns'

import { auth } from '@/server/auth'
import { assertCan } from '@/server/auth/assert-can'
import { getTenantContext, assertClientAccess } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { consumeExportBudget } from '@/server/security/mutation-throttle'
import { logger } from '@/lib/logger'
import { ForbiddenError } from '@/types/errors'
import {
  buildExportDataset,
  EXPORT_RESOURCE_BY_KEY,
  type ExportDataset,
  type ExportResourceKey,
} from '@/server/services/export-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

function toCsv(data: ExportDataset): string {
  const head = data.headers.map(escapeCsv).join(',')
  const body = data.rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
  return UTF8_BOM + head + '\n' + body
}

/**
 * XLSX via exceljs. Valores entram como STRING/number literais (nunca
 * `{ formula }`), então `=SUM(...)` em dado de usuário vira texto inerte —
 * o vetor de formula injection do CSV não existe aqui.
 */
async function toXlsx(data: ExportDataset, sheetName: string): Promise<Buffer> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  const ws = wb.addWorksheet(sheetName.slice(0, 31)) // limite do Excel
  ws.addRow(data.headers)
  ws.getRow(1).font = { bold: true }
  for (const row of data.rows) ws.addRow(row)
  // Largura aproximada por conteúdo (cap 60 p/ não explodir com descrições).
  ws.columns.forEach((col, i) => {
    let max = data.headers[i]?.length ?? 10
    for (const row of data.rows) {
      const len = String(row[i] ?? '').length
      if (len > max) max = len
    }
    col.width = Math.min(Math.max(max + 2, 10), 60)
  })
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
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
    // queries Prisma seguintes deste request (ver `prompt/rls-gambiarra.md`).
    enterClientScope(clientId)

    const def = EXPORT_RESOURCE_BY_KEY.get(resource as ExportResourceKey)
    if (!def) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })

    // Anti-DoS: exportar é leitura PESADA (dataset inteiro + arquivo em memória)
    // e scriptável por curl com o cookie de sessão — orçamento por usuário.
    const budget = await consumeExportBudget(ctx.userId)
    if (!budget.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(budget.retryAfterSec) } }
      )
    }

    // Permissão por MÓDULO de origem: exportar leads exige crm:read, receitas
    // exige financial:read etc. — exportação não pode vazar o que a aba esconde.
    await assertCan(ctx, def.module, 'read')

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

    const fileFormat = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
    const range = def.supportsRange ? { from: dateFrom, to: dateTo } : undefined

    const data = await buildExportDataset(ctx, clientId, def.key, range)
    const stamp = format(new Date(), 'yyyy-MM-dd')
    const filename = `${def.filenameBase}-${stamp}.${fileFormat}`

    if (fileFormat === 'xlsx') {
      const buf = await toXlsx(data, def.label)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return new NextResponse(toCsv(data), {
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
