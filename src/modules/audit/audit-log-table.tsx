'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DateInput } from '@/components/ui/date-input'

const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
  login: 'Login',
  invite: 'Convite',
  stage_change: 'Mudança de etapa',
  export: 'Exportação',
}

const ENTITY_LABELS: Record<string, string> = {
  Client: 'Clínica',
  Lead: 'Lead',
  Revenue: 'Receita',
  Cost: 'Custo',
  Patient: 'Paciente',
  Appointment: 'Agendamento',
  Goal: 'Meta',
  Insight: 'Insight',
  Activity: 'Atividade',
  User: 'Usuário',
  Invitation: 'Convite',
  Procedure: 'Procedimento',
}

const ACTION_VARIANT: Record<string, 'success' | 'critical' | 'warning' | 'info' | 'secondary'> = {
  create: 'success',
  delete: 'critical',
  update: 'info',
  stage_change: 'warning',
  login: 'secondary',
  invite: 'info',
  export: 'secondary',
}

type AuditRow = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  createdAt: Date
  user: { name: string; email: string; role: string } | null
  changes: Record<string, unknown> | null
}

type FilterState = {
  from: string
  to: string
  action: string
  entityType: string
  userId: string
  clientId: string
}

type Props = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  users: { id: string; name: string; email: string }[]
  clients: { id: string; name: string }[]
  initialFilters: FilterState
  onPageChange: (page: number) => void
  onFilterChange: (filters: {
    from?: string
    to?: string
    action?: string
    entityType?: string
    userId?: string
    clientId?: string
  }) => void
}

export function AuditLogTable({
  rows,
  total,
  page,
  pageSize,
  users,
  clients,
  initialFilters,
  onPageChange,
  onFilterChange,
}: Props) {
  const [from, setFrom] = useState(initialFilters.from)
  const [to, setTo] = useState(initialFilters.to)
  const [action, setAction] = useState(initialFilters.action)
  const [entityType, setEntityType] = useState(initialFilters.entityType)
  const [userId, setUserId] = useState(initialFilters.userId)
  const [clientId, setClientId] = useState(initialFilters.clientId)
  const [, startTransition] = useTransition()

  const totalPages = Math.ceil(total / pageSize)

  function applyFilters(overrides: Partial<FilterState> = {}) {
    const f = {
      from: overrides.from ?? from,
      to: overrides.to ?? to,
      action: overrides.action ?? action,
      entityType: overrides.entityType ?? entityType,
      userId: overrides.userId ?? userId,
      clientId: overrides.clientId ?? clientId,
    }
    startTransition(() => {
      onFilterChange({
        from: f.from || undefined,
        to: f.to || undefined,
        action: f.action === '__all__' ? undefined : f.action,
        entityType: f.entityType === '__all__' ? undefined : f.entityType,
        userId: f.userId === '__all__' ? undefined : f.userId,
        clientId: f.clientId === '__all__' ? undefined : f.clientId,
      })
    })
  }

  function downloadCsv() {
    const header = 'Data,Usuário,Email,Ação,Entidade,ID da Entidade\n'
    const body = rows
      .map((r) =>
        [
          format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
          r.user?.name ?? '—',
          r.user?.email ?? '—',
          ACTION_LABELS[r.action] ?? r.action,
          ENTITY_LABELS[r.entityType] ?? r.entityType,
          r.entityId ?? '—',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n')
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-from" className="text-xs text-muted-foreground">
            De
          </label>
          <DateInput
            id="audit-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              applyFilters({ from: e.target.value })
            }}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-to" className="text-xs text-muted-foreground">
            Até
          </label>
          <DateInput
            id="audit-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              applyFilters({ to: e.target.value })
            }}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-action" className="text-xs text-muted-foreground">
            Ação
          </label>
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v)
              applyFilters({ action: v })
            }}
          >
            <SelectTrigger id="audit-action" className="h-8 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as ações</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-entity" className="text-xs text-muted-foreground">
            Entidade
          </label>
          <Select
            value={entityType}
            onValueChange={(v) => {
              setEntityType(v)
              applyFilters({ entityType: v })
            }}
          >
            <SelectTrigger id="audit-entity" className="h-8 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as entidades</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-client" className="text-xs text-muted-foreground">
            Clínica
          </label>
          <Select
            value={clientId}
            onValueChange={(v) => {
              setClientId(v)
              applyFilters({ clientId: v })
            }}
          >
            <SelectTrigger id="audit-client" className="h-8 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as clínicas</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-user" className="text-xs text-muted-foreground">
            Usuário
          </label>
          <Select
            value={userId}
            onValueChange={(v) => {
              setUserId(v)
              applyFilters({ userId: v })
            }}
          >
            <SelectTrigger id="audit-user" className="h-8 w-52 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os usuários</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 self-end" onClick={downloadCsv}>
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </div>

      {/* Contagem */}
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
      </p>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Data</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Usuário</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Ação</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Entidade</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {format(new Date(row.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium leading-tight">{row.user?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{row.user?.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={ACTION_VARIANT[row.action] ?? 'secondary'}>
                      {ACTION_LABELS[row.action] ?? row.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">{ENTITY_LABELS[row.entityType] ?? row.entityType}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {row.entityId ? row.entityId.slice(-8) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
