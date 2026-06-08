'use client'

import {
  formatarBRL,
  formatarPercentual,
  type DREInput,
  type DREOutput,
} from '@/server/services/dre/calcular-dre'

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

/** Render puro da DRE (receita → lucro líquido). Reusado pela clínica e pelo admin. */
export function DreReportTable({ input, output }: { input: DREInput; output: DREOutput }) {
  const rows = buildDreRows(input, output)
  return (
    <div className="divide-y">
      {rows.map((row, idx) => (
        <DreRow key={idx} row={row} />
      ))}
    </div>
  )
}

function DreRow({ row }: { row: DreRowData }) {
  const isSubtotal = row.kind === 'subtotal' || row.kind === 'result'
  const isResult = row.kind === 'result'
  const isItem = row.kind === 'item' || row.kind === 'deduction'
  return (
    <div
      className={[
        'flex items-center justify-between gap-4 px-4 py-2.5',
        isResult ? 'bg-primary/5' : '',
        isSubtotal ? 'font-semibold' : '',
        isItem ? 'pl-8 text-sm text-muted-foreground' : '',
      ].join(' ')}
    >
      <span className={isResult ? 'text-base' : ''}>{row.label}</span>
      <div className="flex items-center gap-3">
        {row.margin != null && (
          <span className="text-xs text-muted-foreground">{formatarPercentual(row.margin)}</span>
        )}
        <span
          className={[
            'tabular-nums',
            isResult ? 'text-base font-bold' : '',
            row.value < 0 ? 'text-muted-foreground' : '',
          ].join(' ')}
        >
          {formatarBRL(row.value)}
        </span>
      </div>
    </div>
  )
}
