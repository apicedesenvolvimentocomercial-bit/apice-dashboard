'use client'

import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { CreditFeeTier } from '@/lib/credit-fee'
import { cn } from '@/lib/utils'
import { updateCreditReceiptConfigAction } from '@/server/actions/settings-actions'

import {
  SETTINGS_BTN_GHOST,
  SETTINGS_BTN_PRIMARY,
  SETTINGS_INPUT,
  SETTINGS_LABEL,
  SettingsSectionCard,
  SettingsSelect,
} from './section-card'

/**
 * Seção Pagamento no crédito — redesign Senno (Configurações-handoff §10).
 * Select de forma de recebimento (44px) + texto de ajuda por modo + bloco
 * condicional de taxa separado por borda TRACEJADA, só no modo antecipação.
 *
 * Desvios documentados vs. protótipo:
 * - A taxa é POR FAIXA de parcelas (modelo real `creditFeeTiers`), não um
 *   campo único "% a.m." — o editor de faixas vive no bloco tracejado.
 * - Texto de ajuda da antecipação reflete o comportamento real: a taxa vira
 *   despesa financeira em Custos (não é descontada da receita).
 */

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

const MODE_HELP: Record<Mode, string> = {
  INSTALLMENTS:
    'As parcelas entram no financeiro na data em que a adquirente repassa cada uma, acompanhando o pagamento do cliente.',
  UPFRONT_FEE:
    'As vendas no crédito entram no financeiro como recebidas à vista; a taxa de antecipação vira uma despesa financeira em Custos.',
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
    <SettingsSectionCard
      title="Pagamento no crédito"
      description="Define como as vendas no crédito entram no financeiro, conforme seu contrato com a adquirente (maquininha)."
    >
      {/* Forma de recebimento (§10.1) */}
      <div className="max-w-[540px]">
        <label htmlFor="credit-mode" className={SETTINGS_LABEL}>
          Forma de recebimento
        </label>
        <SettingsSelect
          id="credit-mode"
          className="h-11"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
        >
          <option value="INSTALLMENTS">Recebo conforme o cliente paga</option>
          <option value="UPFRONT_FEE">Recebo à vista, com taxa de antecipação</option>
        </SettingsSelect>
        <p className="m-0 mt-2.5 text-[12.5px] leading-[1.55] text-muted-foreground">
          {MODE_HELP[mode]}
        </p>
      </div>

      {/* Bloco condicional de taxa — borda tracejada (§10.2) */}
      {mode === 'UPFRONT_FEE' && (
        <div className="mt-5 border-t border-dashed border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <span className={cn(SETTINGS_LABEL, 'mb-0')}>
              Taxa de antecipação por faixa de parcelas
            </span>
            <button type="button" className={SETTINGS_BTN_GHOST} onClick={addTier}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Faixa
            </button>
          </div>

          <div className="mt-3 max-w-[540px] space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 text-xs font-semibold text-muted-foreground">
              <span>Parcela de</span>
              <span>até</span>
              <span>Taxa (%)</span>
              <span className="w-[34px]" aria-hidden="true" />
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={t.min}
                  onChange={(e) => updateTier(i, 'min', e.target.value)}
                  placeholder="1"
                  aria-label="Parcela inicial"
                  className={cn(SETTINGS_INPUT, 'tabular-nums')}
                />
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={t.max}
                  onChange={(e) => updateTier(i, 'max', e.target.value)}
                  placeholder="6"
                  aria-label="Parcela final"
                  className={cn(SETTINGS_INPUT, 'tabular-nums')}
                />
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={t.pct}
                    onChange={(e) => updateTier(i, 'pct', e.target.value)}
                    placeholder="4,5"
                    aria-label="Taxa da faixa (%)"
                    className={cn(SETTINGS_INPUT, 'pr-[30px] tabular-nums')}
                  />
                  <span
                    className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground"
                    aria-hidden="true"
                  >
                    %
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  aria-label="Remover faixa"
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-[15px] w-[15px]" aria-hidden="true" />
                </button>
              </div>
            ))}
            <p className="m-0 text-xs leading-[1.55] text-muted-foreground">
              Ex.: 1 a 1 → 2%, 2 a 6 → 4,5%, 7 a 12 → 6,8%. A taxa é aplicada sobre o valor da
              venda; fora de qualquer faixa, taxa 0%.
            </p>
          </div>
        </div>
      )}

      {/* Rodapé de ação (§10.3) */}
      <div className="mt-[22px] flex justify-end border-t border-border pt-5">
        <button
          type="button"
          className={SETTINGS_BTN_PRIMARY}
          onClick={onSave}
          disabled={isPending}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Salvar
        </button>
      </div>
    </SettingsSectionCard>
  )
}
