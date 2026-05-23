'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Edit2, FileDown, FileUp, Plus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { deleteRevenueAction } from '@/server/actions/revenue-actions'
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

export function RevenuesTab({ revenues, clientId, patients, procedures }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RevenueRow | undefined>()
  const [importOpen, setImportOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
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

  const hasFilters = from || to || paymentMethod || procedureId || patientId

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

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'receita' : 'receitas'}
            {hasFilters && ` (de ${revenues.length} total)`}
          </p>
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Soma:{' '}
              <span className="font-medium text-green-700">{formatCurrency(totalFiltered)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <FileDown className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova receita
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="filter-from" className="text-xs">
            De
          </Label>
          <DateInput
            id="filter-from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-to" className="text-xs">
            Até
          </Label>
          <DateInput
            id="filter-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pagamento</Label>
          <Select
            value={paymentMethod || ALL_VALUE}
            onValueChange={(v) => setPaymentMethod(v === ALL_VALUE ? '' : v)}
          >
            <SelectTrigger className="h-8 text-xs">
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
        <div className="space-y-1">
          <Label className="text-xs">Procedimento</Label>
          <Select
            value={procedureId || ALL_VALUE}
            onValueChange={(v) => setProcedureId(v === ALL_VALUE ? '' : v)}
          >
            <SelectTrigger className="h-8 text-xs">
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
        <div className="space-y-1">
          <Label className="text-xs">Paciente</Label>
          <Select
            value={patientId || ALL_VALUE}
            onValueChange={(v) => setPatientId(v === ALL_VALUE ? '' : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todos</SelectItem>
              {patients.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <div className="col-span-2 flex items-end lg:col-span-5">
            <Button size="sm" variant="ghost" onClick={clearFilters} className="h-7 text-xs">
              <X className="mr-1 h-3 w-3" />
              Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {revenues.length === 0
              ? 'Nenhuma receita registrada'
              : 'Nenhuma receita corresponde aos filtros'}
          </p>
          {revenues.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Adicione receitas manuais ou elas serão criadas automaticamente ao confirmar
              agendamentos.
            </p>
          )}
          {revenues.length === 0 && (
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar receita
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left font-medium">Data</th>
                <th className="px-4 py-2.5 text-left font-medium">Descrição</th>
                <th className="px-4 py-2.5 text-left font-medium">Paciente</th>
                <th className="px-4 py-2.5 text-left font-medium">Procedimento</th>
                <th className="px-4 py-2.5 text-left font-medium">Pagamento</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {format(new Date(r.date), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2.5">{r.description ?? '—'}</td>
                  <td className="px-4 py-2.5">{r.patient?.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.procedures && r.procedures.length > 0
                      ? r.procedures.map((p) => p.name).join(', ')
                      : (r.procedure?.name ?? '—')}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.paymentMethod ? (
                      <Badge variant="secondary" className="text-xs">
                        {PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
                        {(r.installments ?? 1) > 1 ? ` ${r.installments}x` : ''}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-green-700">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(r)}
                        aria-label="Editar receita"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={deleting === r.id}
                        onClick={() => handleDelete(r.id)}
                        aria-label="Remover receita"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </>
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
