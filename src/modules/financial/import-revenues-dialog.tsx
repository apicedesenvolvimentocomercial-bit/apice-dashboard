'use client'

import { AlertTriangle, FileText, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { importRevenuesAction } from '@/server/actions/revenue-actions'
import { NONE_VALUE, parseCsv } from './types'

type Props = {
  open: boolean
  clientId: string
  onOpenChange: (v: boolean) => void
  onImported: () => void
}

type Mapping = {
  amount: string
  date: string
  description: string
  paymentMethod: string
  installments: string
  procedureName: string
}

const REQUIRED_FIELDS: (keyof Mapping)[] = ['amount', 'date']

const EMPTY_MAPPING: Mapping = {
  amount: '',
  date: '',
  description: '',
  paymentMethod: '',
  installments: '',
  procedureName: '',
}

export function ImportRevenuesDialog({ open, clientId, onOpenChange, onImported }: Props) {
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING)
  const [fileName, setFileName] = useState('')

  function reset() {
    setRows([])
    setHeaders([])
    setMapping(EMPTY_MAPPING)
    setFileName('')
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length < 2) {
      toast.error('CSV vazio ou inválido (precisa de cabeçalho + ao menos 1 linha)')
      return
    }
    const [head, ...body] = parsed
    const trimmedHeaders = head.map((h) => h.trim())
    setHeaders(trimmedHeaders)
    setRows(body)
    autoMap(trimmedHeaders)
  }

  function autoMap(cols: string[]) {
    const next: Mapping = { ...EMPTY_MAPPING }
    for (const col of cols) {
      const lower = col.toLowerCase().trim()
      if (!next.amount && /(valor|amount|preço|preco|price)/.test(lower)) next.amount = col
      else if (!next.date && /(data|date)/.test(lower)) next.date = col
      else if (!next.description && /(descri|description|obs|nota)/.test(lower))
        next.description = col
      else if (!next.paymentMethod && /(pagamento|method|forma)/.test(lower))
        next.paymentMethod = col
      else if (!next.installments && /(parcela|installment)/.test(lower)) next.installments = col
      else if (!next.procedureName && /(procedimento|procedure|servico|serviço)/.test(lower))
        next.procedureName = col
    }
    setMapping(next)
  }

  const previewSample = rows.slice(0, 3)
  const canSubmit = REQUIRED_FIELDS.every((f) => mapping[f].length > 0) && rows.length > 0

  function handleSubmit() {
    if (!canSubmit) {
      toast.error('Mapeie ao menos Valor e Data')
      return
    }
    const colIndex = (name: string) => headers.indexOf(name)
    const records = rows
      .map((row) => ({
        amountRaw: row[colIndex(mapping.amount)] ?? '',
        dateRaw: row[colIndex(mapping.date)] ?? '',
        description: mapping.description ? row[colIndex(mapping.description)] : '',
        paymentMethod: mapping.paymentMethod ? row[colIndex(mapping.paymentMethod)] : '',
        installmentsRaw: mapping.installments ? row[colIndex(mapping.installments)] : '',
        procedureName: mapping.procedureName ? row[colIndex(mapping.procedureName)] : '',
      }))
      .filter((r) => r.amountRaw.trim() && r.dateRaw.trim())

    if (records.length === 0) {
      toast.error('Nenhuma linha válida para importar')
      return
    }

    startTransition(async () => {
      const result = await importRevenuesAction(clientId, records)
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      const { imported, skipped } = result.data
      toast.success(
        `${imported} receita(s) importada(s)${skipped > 0 ? ` (${skipped} ignorada(s))` : ''}`
      )
      handleOpenChange(false)
      onImported()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Importar receitas (CSV)</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Selecione um arquivo CSV</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Deve conter cabeçalho e ao menos colunas de valor e data.
              </p>
              <Input
                type="file"
                accept=".csv,text/csv"
                className="mt-4"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Exemplo de formato:</p>
              <pre className="mt-1 font-mono">
                {`data;descricao;valor;forma_pagamento;parcelas;procedimento
2025-01-15;Limpeza de pele;250,00;PIX;1;Limpeza de pele
2025-01-16;Botox;1500,00;CREDIT_CARD;3;Botox`}
              </pre>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground">{rows.length} linha(s)</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={reset}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Mapeamento de colunas</p>
              <div className="grid grid-cols-2 gap-3">
                <MappingField
                  label="Valor *"
                  value={mapping.amount}
                  onChange={(v) => setMapping((m) => ({ ...m, amount: v }))}
                  headers={headers}
                />
                <MappingField
                  label="Data *"
                  value={mapping.date}
                  onChange={(v) => setMapping((m) => ({ ...m, date: v }))}
                  headers={headers}
                />
                <MappingField
                  label="Descrição"
                  value={mapping.description}
                  onChange={(v) => setMapping((m) => ({ ...m, description: v }))}
                  headers={headers}
                  allowNone
                />
                <MappingField
                  label="Forma de pagamento"
                  value={mapping.paymentMethod}
                  onChange={(v) => setMapping((m) => ({ ...m, paymentMethod: v }))}
                  headers={headers}
                  allowNone
                />
                <MappingField
                  label="Parcelas"
                  value={mapping.installments}
                  onChange={(v) => setMapping((m) => ({ ...m, installments: v }))}
                  headers={headers}
                  allowNone
                />
                <MappingField
                  label="Procedimento (por nome)"
                  value={mapping.procedureName}
                  onChange={(v) => setMapping((m) => ({ ...m, procedureName: v }))}
                  headers={headers}
                  allowNone
                />
              </div>
            </div>

            <div className="rounded-md border">
              <p className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">
                Pré-visualização ({previewSample.length} de {rows.length})
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="px-2 py-1.5 text-left font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewSample.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {headers.map((_, j) => (
                        <td key={j} className="px-2 py-1.5">
                          {row[j] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Datas aceitas: <code>YYYY-MM-DD</code> ou <code>DD/MM/YYYY</code>. Valores com
                vírgula ou ponto. Parcelas: 1 a 36. Procedimento: busca por nome (case-insensitive).
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? 'Importando...' : `Importar ${rows.length} linha(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MappingField({
  label,
  value,
  onChange,
  headers,
  allowNone = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  headers: string[]
  allowNone?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value || NONE_VALUE}
        onValueChange={(v) => onChange(v === NONE_VALUE ? '' : v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Selecione..." />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE_VALUE}>— Ignorar —</SelectItem>}
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
