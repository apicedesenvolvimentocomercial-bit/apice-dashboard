'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

import { NONE_VALUE, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type RevenueDetails } from './types'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const todayISO = () => new Date().toISOString().slice(0, 10)

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preço bruto do procedimento, p/ prévia do líquido. */
  price?: number | null
  /** Título/descrição contextual (ex.: "Fechar venda" vs "Registrar receita"). */
  title?: string
  description?: string
  pending?: boolean
  onConfirm: (details: RevenueDetails) => void
  onCancel?: () => void
}

/**
 * Detalhes de pagamento da baixa (forma, parcelas, desconto, data) — mesmo nível
 * do registro manual de receita. Usado pela baixa da agenda e pelo card→Fechado.
 */
export function RevenueDetailsDialog({
  open,
  onOpenChange,
  price,
  title = 'Registrar receita',
  description = 'Informe os dados do pagamento para dar baixa.',
  pending,
  onConfirm,
  onCancel,
}: Props) {
  const [paymentMethod, setPaymentMethod] = useState(NONE_VALUE)
  const [installments, setInstallments] = useState('1')
  const [discountPct, setDiscountPct] = useState('')
  const [date, setDate] = useState(todayISO())

  // Reseta os campos a cada abertura (o dialog é reusado entre cards/agendamentos).
  useEffect(() => {
    if (!open) return
    setPaymentMethod(NONE_VALUE)
    setInstallments('1')
    setDiscountPct('')
    setDate(todayISO())
  }, [open])

  const inst = Math.max(1, parseInt(installments || '1', 10) || 1)
  const disc = Math.min(100, Math.max(0, Number(discountPct || 0)))
  const liquid = price != null ? Math.round(price * (1 - disc / 100) * 100) / 100 : null

  function cancel() {
    onOpenChange(false)
    onCancel?.()
  }

  function confirm() {
    onConfirm({
      paymentMethod: paymentMethod === NONE_VALUE ? null : paymentMethod,
      installments: inst,
      discountPct: disc,
      date: date || undefined,
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel()
        else onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby="rev-details-desc">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="rev-details-desc">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {price != null && (
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Valor do procedimento</span>
              <span className="font-medium tabular-nums">{brl(price)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Não informar</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Parcelas</Label>
              <Input
                type="number"
                min={1}
                max={36}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desconto (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {liquid != null && (
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">Líquido a receber</span>
              <span className="font-bold tabular-nums">
                {brl(liquid)}
                {inst > 1 && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    em {inst}x de {brl(Math.round((liquid / inst) * 100) / 100)}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar receita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
