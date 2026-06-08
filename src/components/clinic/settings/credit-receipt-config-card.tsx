'use client'

import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CreditFeeTier } from '@/lib/credit-fee'
import { updateCreditReceiptConfigAction } from '@/server/actions/settings-actions'

type Mode = 'INSTALLMENTS' | 'UPFRONT_FEE'
// Faixas como string no input (permite edição livre); convertidas ao salvar.
type TierDraft = { min: string; max: string; pct: string }

type Props = {
  initialMode: Mode
  initialTiers: CreditFeeTier[]
}

function toDraft(t: CreditFeeTier): TierDraft {
  return { min: String(t.min), max: String(t.max), pct: String(t.pct) }
}

export function CreditReceiptConfigCard({ initialMode, initialTiers }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [tiers, setTiers] = useState<TierDraft[]>(
    initialTiers.length > 0 ? initialTiers.map(toDraft) : [{ min: '1', max: '1', pct: '' }]
  )
  const [isPending, startTransition] = useTransition()

  function updateTier(i: number, key: keyof TierDraft, value: string) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)))
  }
  function addTier() {
    setTiers((prev) => [...prev, { min: '', max: '', pct: '' }])
  }
  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i))
  }

  function onSave() {
    let parsedTiers: CreditFeeTier[] = []
    if (mode === 'UPFRONT_FEE') {
      const rows = tiers
        .map((t) => ({ min: Number(t.min), max: Number(t.max), pct: Number(t.pct) }))
        .filter((t) => t.min || t.max || t.pct) // ignora linhas em branco
      for (const t of rows) {
        if (!Number.isFinite(t.min) || !Number.isFinite(t.max) || !Number.isFinite(t.pct)) {
          toast.error('Preencha número de parcelas e taxa em todas as faixas')
          return
        }
        if (t.min < 1 || t.max < t.min || t.pct < 0) {
          toast.error('Faixa inválida: parcela inicial ≥ 1 e final ≥ inicial')
          return
        }
      }
      parsedTiers = rows
    }

    startTransition(async () => {
      const res = await updateCreditReceiptConfigAction({
        creditReceiptMode: mode,
        creditFeeTiers: parsedTiers,
      })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Recebimento no crédito atualizado')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recebimento no cartão de crédito</CardTitle>
        <CardDescription>
          Define como as vendas no crédito entram no financeiro, conforme seu contrato com a
          adquirente (maquininha).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Modelo do contrato</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="INSTALLMENTS">Recebo parcelado (conforme o cliente paga)</option>
            <option value="UPFRONT_FEE">Recebo à vista com taxa de antecipação</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {mode === 'INSTALLMENTS'
              ? 'As parcelas entram em “Contas a receber”, uma por mês.'
              : 'A venda no crédito entra como recebida à vista; a taxa de antecipação vira uma despesa financeira em “Custos”.'}
          </p>
        </div>

        {mode === 'UPFRONT_FEE' && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Taxa por faixa de parcelas</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTier}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Faixa
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 text-xs text-muted-foreground">
              <span>Parcela de</span>
              <span>até</span>
              <span>Taxa (%)</span>
              <span className="sr-only">Remover</span>
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={t.min}
                  onChange={(e) => updateTier(i, 'min', e.target.value)}
                  placeholder="1"
                />
                <Input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={t.max}
                  onChange={(e) => updateTier(i, 'max', e.target.value)}
                  placeholder="6"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={t.pct}
                  onChange={(e) => updateTier(i, 'pct', e.target.value)}
                  placeholder="4,5"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTier(i)}
                  aria-label="Remover faixa"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Ex.: 1 a 1 → 2%, 2 a 6 → 4,5%, 7 a 12 → 6,8%. A taxa é aplicada sobre o valor da
              venda; fora de qualquer faixa, taxa 0%.
            </p>
          </div>
        )}

        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  )
}
