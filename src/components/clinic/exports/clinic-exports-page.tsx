'use client'

import {
  Activity,
  Calendar,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Kanban,
  Receipt,
  Stethoscope,
  Target,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Aba Exportações (domínio clínica). Cada card baixa um dataset no formato
 * escolhido — CSV (universal, abre no Excel/Sheets) ou XLSX (Excel nativo).
 * O período vale p/ os datasets que suportam recorte por data; vazio = tudo.
 * A lista de cards já vem FILTRADA pelo servidor (só módulos que o cargo lê)
 * e a rota de export re-valida a permissão.
 */

export type ExportResourceItem = {
  key: string
  label: string
  description: string
  supportsRange: boolean
}

const RESOURCE_ICONS: Record<string, LucideIcon> = {
  leads: Kanban,
  patients: UserCheck,
  appointments: Calendar,
  revenues: DollarSign,
  costs: Receipt,
  receivables: Receipt,
  procedures: Stethoscope,
  activities: Activity,
  goals: Target,
}

function fmtISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ClinicExportsPage({
  clientId,
  resources,
  canFinancialReport,
}: {
  clientId: string
  resources: ExportResourceItem[]
  canFinancialReport: boolean
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function preset(kind: 'month' | 'lastMonth' | 'last90' | 'all') {
    const now = new Date()
    if (kind === 'all') {
      setFrom('')
      setTo('')
      return
    }
    if (kind === 'month') {
      setFrom(fmtISO(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(fmtISO(now))
      return
    }
    if (kind === 'lastMonth') {
      setFrom(fmtISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
      setTo(fmtISO(new Date(now.getFullYear(), now.getMonth(), 0)))
      return
    }
    setFrom(fmtISO(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)))
    setTo(fmtISO(now))
  }

  function exportUrl(key: string, format: 'csv' | 'xlsx', supportsRange: boolean): string {
    const params = new URLSearchParams({ format })
    if (supportsRange) {
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    }
    return `/api/export/${clientId}/${key}?${params.toString()}`
  }

  function reportUrl(): string {
    const params = new URLSearchParams()
    if (from && to) {
      params.set('from', from)
      params.set('to', to)
    }
    const qs = params.toString()
    return `/api/reports/${clientId}/pdf${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exportações</h1>
        <p className="text-sm text-muted-foreground">
          Baixe os dados da clínica em CSV (universal) ou Excel. Os arquivos saem prontos para
          planilha: datas no formato brasileiro e valores com vírgula.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período</CardTitle>
          <CardDescription>
            Vale para os dados com data (receitas, agenda, leads…). Vazio = histórico completo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="export-from">De</Label>
            <Input
              id="export-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-to">Até</Label>
            <Input
              id="export-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => preset('month')}>
              Este mês
            </Button>
            <Button variant="outline" size="sm" onClick={() => preset('lastMonth')}>
              Mês passado
            </Button>
            <Button variant="outline" size="sm" onClick={() => preset('last90')}>
              Últimos 90 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => preset('all')}>
              Tudo
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canFinancialReport && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Relatório executivo (PDF)</CardTitle>
              </div>
              <CardDescription>
                KPIs, top procedimentos, custos e metas do período — pronto para apresentar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm">
                <a href={reportUrl()}>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar PDF
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {resources.map((r) => {
          const Icon = RESOURCE_ICONS[r.key] ?? FileSpreadsheet
          return (
            <Card key={r.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{r.label}</CardTitle>
                </div>
                <CardDescription>
                  {r.description}
                  {!r.supportsRange && ' (sempre completo, sem recorte de período)'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={exportUrl(r.key, 'csv', r.supportsRange)}>
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={exportUrl(r.key, 'xlsx', r.supportsRange)}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Excel
                  </a>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {resources.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Seu cargo não tem acesso de leitura a nenhum dado exportável.
        </p>
      )}
    </div>
  )
}
