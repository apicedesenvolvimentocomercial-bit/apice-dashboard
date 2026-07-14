'use client'

import {
  formatarBRL,
  formatarPercentual,
  type DREInput,
  type DREOutput,
} from '@/server/services/dre/calcular-dre'
import { cn } from '@/lib/utils'

export type DreRowData = {
  label: string
  value: number
  kind: 'subtotal' | 'deduction' | 'item' | 'result'
  margin?: number | null
}

/** Linhas da DRE (receita → lucro líquido). Fonte única p/ a tabela e o export CSV. */
export function buildDreRows(i: DREInput, o: DREOutput): DreRowData[] {
  const item = (label: string, value: number): DreRowData[] =>
    value ? [{ label, value, kind: 'item' as const }] : []
  return [
    { label: 'Receita Bruta', value: o.receitaBruta, kind: 'subtotal' },
    ...item('Procedimentos', i.receitaProcedimentos ?? 0),
    ...item('Pacotes', i.receitaPacotes ?? 0),
    ...item('Recorrência', i.receitaRecorrencia ?? 0),
    ...item('Produtos', i.receitaProdutos ?? 0),
    ...item('Outras', i.outrasReceitas ?? 0),
    { label: '(−) Deduções', value: -o.deducoes, kind: 'deduction' },
    ...item('Impostos sobre receita', -(i.impostosSobreReceita ?? 0)),
    ...item('Cancelamentos', -(i.cancelamentos ?? 0)),
    ...item('Inadimplência', -(i.inadimplencia ?? 0)),
    ...item('Descontos', -(i.descontos ?? 0)),
    { label: 'Receita Líquida', value: o.receitaLiquida, kind: 'subtotal' },
    { label: '(−) Custo dos serviços (CSP)', value: -o.csp, kind: 'deduction' },
    ...item('Custo de produtos/procedimentos', -(i.custoProdutos ?? 0)),
    ...item('Comissões', -(i.comissoes ?? 0)),
    ...item('Custos operacionais diretos', -(i.custosOperacionaisDiretos ?? 0)),
    { label: 'Lucro Bruto', value: o.lucroBruto, kind: 'subtotal', margin: o.margemBruta },
    { label: '(−) Despesas Operacionais', value: -o.despesasOperacionais, kind: 'deduction' },
    ...item('Marketing', -(i.despesasMarketing ?? 0)),
    ...item('Comerciais', -(i.despesasComerciais ?? 0)),
    ...item('Administrativas', -(i.despesasAdministrativas ?? 0)),
    { label: 'EBITDA', value: o.ebitda, kind: 'subtotal', margin: o.margemEbitda },
    { label: '(−) Depreciação e Amortização', value: -o.depreciacaoAmortizacao, kind: 'deduction' },
    { label: 'EBIT (resultado operacional)', value: o.ebit, kind: 'subtotal' },
    { label: 'Resultado Financeiro', value: o.resultadoFinanceiro, kind: 'item' },
    { label: 'LAIR (lucro antes do IR)', value: o.lair, kind: 'subtotal' },
    ...(o.impostoSobreLucro
      ? [
          {
            label: '(−) Imposto sobre o lucro',
            value: -o.impostoSobreLucro,
            kind: 'deduction' as const,
          },
        ]
      : []),
    { label: 'Lucro Líquido', value: o.lucroLiquido, kind: 'result', margin: o.margemLiquida },
  ]
}

/**
 * Render da DRE em cascata — redesign Senno (Financeiro-handoff §6.2): linha de
 * seção com fundo `muted/0.45` e 13.5px/600; subitem indentado 30px em muted;
 * coluna de % (64px) só nos subtotais com margem. Reusado clínica + admin.
 */
export function DreReportTable({ input, output }: { input: DREInput; output: DREOutput }) {
  const rows = buildDreRows(input, output)
  return (
    <div>
      {rows.map((row, idx) => (
        <DreRow key={idx} row={row} />
      ))}
    </div>
  )
}

function DreRow({ row }: { row: DreRowData }) {
  const isSection = row.kind === 'subtotal' || row.kind === 'result'
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-border first:border-t-0',
        isSection ? 'bg-muted/45 px-[18px] py-3.5' : 'py-[11px] pl-[30px] pr-[18px]'
      )}
    >
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          isSection
            ? 'text-[13.5px] font-semibold text-foreground'
            : 'text-[12.5px] text-muted-foreground'
        )}
      >
        {row.label}
      </span>
      <span className="w-16 flex-none text-right text-xs tabular-nums text-muted-foreground">
        {row.margin != null ? formatarPercentual(row.margin) : ''}
      </span>
      <span
        className={cn(
          'w-[150px] flex-none text-right tabular-nums',
          isSection
            ? 'text-[13.5px] font-semibold text-foreground'
            : 'text-[12.5px] text-foreground'
        )}
      >
        {formatarBRL(row.value)}
      </span>
    </div>
  )
}
