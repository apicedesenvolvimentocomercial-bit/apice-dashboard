'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Ban,
  Edit2,
  FileDown,
  FileUp,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { cn } from '@/lib/utils'
import { cancelRevenueAction, deleteRevenueAction } from '@/server/actions/revenue-actions'
import { CreateRevenueDialog } from './create-revenue-dialog'
import { ImportRevenuesDialog } from './import-revenues-dialog'
import {
  ALL_VALUE,
  formatCurrency,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  toCsv,
  withBom,
} from './types'
import type { RevenueRow, ProcedureForSelect } from './types'

type Patient = { id: string; name: string }

type Props = {
  revenues: RevenueRow[]
  clientId: string
  patients: Patient[]
  procedures: ProcedureForSelect[]
}

// Mesmo grid no cabeçalho e nas linhas p/ alinhar as colunas (handoff §7.3).
const GRID =
  'grid grid-cols-[108px_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_96px_120px_110px] items-center gap-3.5'

/**
 * Aba Receitas — redesign Senno (Financeiro-handoff §7): contador + soma à
 * esquerda; Filtros (popover REAL — datas, pagamento, procedimento, paciente),
 * Exportar/Importar CSV e "Nova receita" à direita; tabela num card com valor
 * em `ok` e ações Editar/Estornar/Excluir por linha.
 */
export function RevenuesTab({ revenues, clientId, patients, procedures }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RevenueRow | undefined>()
  const [importOpen, setImportOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [procedureId, setProcedureId] = useState('')
  const [patientId, setPatientId] = useState('')

  const filtered = useMemo(() => {
    return revenues.filter((r) => {
      const date = new Date(r.date)
      if (from && date < new Date(from)) return false
      if (to) {
        const endOfDay = new Date(to)
        endOfDay.setHours(23, 59, 59, 999)
        if (date > endOfDay) return false
      }
      if (paymentMethod && r.paymentMethod !== paymentMethod) return false
      if (procedureId && r.procedure?.id !== procedureId) return false
      if (patientId && r.patient?.id !== patientId) return false
      return true
    })
  }, [revenues, from, to, paymentMethod, procedureId, patientId])

  const totalFiltered = useMemo(() => filtered.reduce((sum, r) => sum + r.amount, 0), [filtered])

  const hasFilters = Boolean(from || to || paymentMethod || procedureId || patientId)

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(rev: RevenueRow) {
    setEditing(rev)
    setDialogOpen(true)
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setPaymentMethod('')
    setProcedureId('')
    setPatientId('')
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta receita?')) return
    setDeleting(id)
    await deleteRevenueAction(id, clientId)
    toast.success('Receita removida')
    router.refresh()
    setDeleting(null)
  }

  async function handleCancel(id: string) {
    if (
      !confirm(
        'Cancelar esta receita? Ela vira dedução (cancelamentos) na DRE e as parcelas pendentes são canceladas.'
      )
    )
      return
    const reason = prompt('Motivo do cancelamento (opcional):') ?? undefined
    const res = await cancelRevenueAction(id, clientId, reason)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    toast.success('Receita cancelada')
    router.refresh()
  }

  function handleExport() {
    if (filtered.length === 0) {
      toast.error('Nenhuma receita para exportar')
      return
    }
    const rows = filtered.map((r) => ({
      data: format(new Date(r.date), 'yyyy-MM-dd'),
      descricao: r.description ?? '',
      paciente: r.patient?.name ?? '',
      procedimento:
        r.procedures && r.procedures.length > 0
          ? r.procedures.map((p) => p.name).join(', ')
          : (r.procedure?.name ?? ''),
      forma_pagamento: r.paymentMethod
        ? (PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod)
        : '',
      parcelas: r.installments ?? 1,
      valor: r.amount.toFixed(2).replace('.', ','),
    }))
    const csv = toCsv(rows, [
      'data',
      'descricao',
      'paciente',
      'procedimento',
      'forma_pagamento',
      'parcelas',
      'valor',
    ])
    downloadCsv(csv, `receitas-${new Date().toISOString().split('T')[0]}.csv`)
    toast.success(`${filtered.length} receitas exportadas`)
  }

  const secondaryBtn =
    'inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Header da aba (handoff §7.1) ---- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium">
            {filtered.length} {filtered.length === 1 ? 'receita' : 'receitas'}
            {hasFilters && (
              <span className="text-muted-foreground"> (de {revenues.length} no total)</span>
            )}
          </p>
          {filtered.length > 0 && (
            <p className="text-[12.5px] text-muted-foreground">
              Soma:{' '}
              <span className="font-semibold tabular-nums text-ok">
                {formatCurrency(totalFiltered)}
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-[9px]">
          {/* Filtros com popover ancorado (handoff §7.2) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={cn(
                'inline-flex h-[38px] items-center gap-2 rounded-[9px] border px-3.5 text-[13px] font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filtersOpen || hasFilters
                  ? 'border-[hsl(var(--ring))] bg-accent text-primary-text'
                  : 'border-border bg-card text-foreground'
              )}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filtros
            </button>
            {filtersOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setFiltersOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-[280px] flex-col gap-3 rounded-[13px] border border-border bg-card p-3.5 shadow-pop">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold">Filtrar receitas</span>
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      aria-label="Fechar filtros"
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-[15px] w-[15px]" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <Label
                        htmlFor="rev-filter-from"
                        className="mb-1.5 block text-xs font-semibold"
                      >
                        De
                      </Label>
                      <DateInput
                        id="rev-filter-from"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="rev-filter-to" className="mb-1.5 block text-xs font-semibold">
                        Até
                      </Label>
                      <DateInput
                        id="rev-filter-to"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold">Pagamento</Label>
                    <Select
                      value={paymentMethod || ALL_VALUE}
                      onValueChange={(v) => setPaymentMethod(v === ALL_VALUE ? '' : v)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold">Procedimento</Label>
                    <Select
                      value={procedureId || ALL_VALUE}
                      onValueChange={(v) => setProcedureId(v === ALL_VALUE ? '' : v)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                        {procedures.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold">Paciente</Label>
                    <SearchableSelect
                      value={patientId || ALL_VALUE}
                      onChange={(v) => setPatientId(v === ALL_VALUE ? '' : v)}
                      placeholder="Todos"
                      emptyText="Nenhum paciente encontrado"
                      className="h-9 text-xs"
                      options={[
                        { value: ALL_VALUE, label: 'Todos' },
                        ...patients.map((p) => ({ value: p.id, label: p.name })),
                      ]}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="h-[34px] rounded-lg px-3 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      className="h-[34px] rounded-lg bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button type="button" onClick={handleExport} className={secondaryBtn}>
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className={secondaryBtn}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Importar CSV
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-[38px] items-center gap-[7px] rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
            Nova receita
          </button>
        </div>
      </div>

      {/* ---- Tabela (handoff §7.3) ou vazio composto ---- */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-6 py-[46px] text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
            <Receipt className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="text-sm font-semibold">
            {revenues.length === 0
              ? 'Nenhuma receita registrada'
              : 'Nenhuma receita corresponde aos filtros'}
          </div>
          <p className="-mt-1 max-w-[420px] text-[12.5px] text-muted-foreground">
            {revenues.length === 0
              ? 'Adicione receitas manuais ou elas serão criadas automaticamente ao confirmar agendamentos.'
              : 'Ajuste os filtros para ver outros lançamentos.'}
          </p>
          {revenues.length === 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-1.5 inline-flex h-9 items-center gap-[7px] rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
            >
              <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
              Adicionar receita
            </button>
          ) : (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-1.5 h-9 rounded-[9px] border border-input bg-background px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[13px] border border-border bg-card shadow-card">
          <div className="min-w-[860px]">
            <div
              className={cn(
                GRID,
                'border-b border-border bg-muted/40 px-[18px] py-[11px] text-[11.5px] font-semibold uppercase tracking-[0.02em] text-muted-foreground'
              )}
            >
              <div>Data</div>
              <div>Descrição</div>
              <div>Paciente</div>
              <div>Procedimento</div>
              <div>Pagamento</div>
              <div className="text-right">Valor</div>
              <div />
            </div>

            {filtered.map((r) => (
              <div
                key={r.id}
                className={cn(
                  GRID,
                  'border-t border-border px-[18px] py-[13px] transition-colors hover:bg-accent/50'
                )}
              >
                <div className="text-[12.5px] tabular-nums">
                  {format(new Date(r.date), 'dd/MM/yyyy', { locale: ptBR })}
                </div>
                <div className="truncate text-[12.5px] text-muted-foreground">
                  {r.description ?? '—'}
                </div>
                <div className="truncate text-[13px] font-medium">{r.patient?.name ?? '—'}</div>
                <div className="truncate text-[12.5px] text-foreground">
                  {r.procedures && r.procedures.length > 0
                    ? r.procedures.map((p) => p.name).join(', ')
                    : (r.procedure?.name ?? '—')}
                </div>
                <div>
                  {r.paymentMethod ? (
                    <span className="inline-flex whitespace-nowrap rounded-full bg-muted px-2.5 py-[3px] text-[11px] font-semibold leading-none text-foreground">
                      {PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
                      {(r.installments ?? 1) > 1 ? ` ${r.installments}x` : ''}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">—</span>
                  )}
                </div>
                <div className="text-right">
                  {r.status === 'CANCELADA' ? (
                    <>
                      <span className="text-[13px] font-semibold tabular-nums text-muted-foreground line-through">
                        {formatCurrency(r.amount)}
                      </span>
                      <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">
                        Cancelada
                      </div>
                    </>
                  ) : (
                    <span className="text-[13px] font-semibold tabular-nums text-ok">
                      {formatCurrency(r.amount)}
                    </span>
                  )}
                </div>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    title="Editar"
                    aria-label="Editar receita"
                    onClick={() => openEdit(r)}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {r.status !== 'CANCELADA' && (
                    <button
                      type="button"
                      title="Estornar"
                      aria-label="Estornar receita"
                      onClick={() => handleCancel(r.id)}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Excluir"
                    aria-label="Remover receita"
                    disabled={deleting === r.id}
                    onClick={() => handleDelete(r.id)}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/[0.12] hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CreateRevenueDialog
        open={dialogOpen}
        clientId={clientId}
        patients={patients}
        procedures={procedures}
        revenue={editing}
        onOpenChange={setDialogOpen}
        onSaved={() => router.refresh()}
      />
      <ImportRevenuesDialog
        open={importOpen}
        clientId={clientId}
        onOpenChange={setImportOpen}
        onImported={() => router.refresh()}
      />
    </div>
  )
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([withBom(csv)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
