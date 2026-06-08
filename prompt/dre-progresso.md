# DRE automática (competência) — ledger

> Feature grande: DRE (Demonstração do Resultado) automática a partir dos dados da
> clínica. Origem: função `calcularDRE` fornecida pelo usuário (pura, fica em
> `src/server/services/dre/`). O gargalo nunca foi a matemática — é **alimentar os
> inputs** a partir do modelo. Esta feature implementa a captação desses dados.

## Decisões (tomadas com o usuário, 2026-06-01)

1. **Regime: COMPETÊNCIA** (accrual), não caixa. Receita é reconhecida quando
   **gerada** (serviço/faturamento na `Revenue.date`), não quando recebida. Inadimplência
   e cancelamento viram **reais**. Implica: `Revenue` ganha bruto/desconto/status; o
   recebimento vive nas **parcelas** (contas a receber).
2. **Receita categorizada:** `Revenue.type` (PROCEDIMENTO/PACOTE/RECORRENCIA/PRODUTO/
   OUTRA/FINANCEIRA). FINANCEIRA alimenta `receitasFinanceiras` da DRE (fora da receita bruta).
3. **Módulo de ativos completo:** modelo `FixedAsset` com vida útil + cálculo de
   depreciação (TANGÍVEL) / amortização (INTANGÍVEL) por período.
4. **Multi-regime tributário:** `Client.taxRegime` (SIMPLES/PRESUMIDO/REAL) + split do
   imposto em **sobre receita** (`TAX_REVENUE`: ISS/PIS/COFINS/Simples → dedução) e
   **sobre lucro** (`TAX_PROFIT`: IRPJ/CSLL → pós-LAIR).
5. **KPIs em COMPETÊNCIA** (faturado) — refletem o resultado econômico real — **+ um
   bloco de CAIXA** (quanto entrou) derivado das parcelas pagas, para não perder a
   liquidez. Metas de receita passam a bater ao **faturar**.
6. **Contas a receber POR PARCELA:** modelo `Receivable` (parcela: vencimento, status,
   pago). Inadimplência = parcela vencida não paga. Caixa = parcelas pagas por `paidAt`.

## Mapa input da DRE → fonte

| Input                     | Fonte                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| receita\* (5 tipos)       | `Revenue` por `type`, `date` no período, `status != CANCELADA`    |
| descontos                 | Σ `Revenue.discount` no período                                   |
| cancelamentos             | `Revenue.status = CANCELADA` (reconhecida e cancelada) no período |
| inadimplencia             | `Receivable` vencidas não pagas (write-off) no período            |
| impostosSobreReceita      | `Cost.type = TAX_REVENUE`                                         |
| impostoSobreLucro         | `Cost.type = TAX_PROFIT`                                          |
| custoProdutos             | `Cost.type = VARIABLE`, `category = PROCEDURE_COST` (já existe)   |
| comissoes                 | `Cost.type = COMMISSION`                                          |
| despesasMarketing         | `Cost.type = MARKETING`                                           |
| despesasComerciais        | `Cost.type = COMMERCIAL`                                          |
| despesasAdministrativas   | `Cost.type ∈ {ADMINISTRATIVE, PAYROLL, FIXED}`                    |
| despesasFinanceiras       | `Cost.type = FINANCIAL_EXPENSE`                                   |
| receitasFinanceiras       | `Revenue.type = FINANCEIRA` no período                            |
| depreciacao / amortizacao | `FixedAsset` (TANGÍVEL / INTANGÍVEL) calculado p/ o período       |

## Plano (etapas)

- **A. Modelagem** — schema + migration + RLS + backfill. _(em andamento)_
- **B. Serviço DRE** — monta `DREInput` do período + `calcularDRE` + testes.
- **C. KPIs** — competência (faturado) + bloco de caixa (parcelas pagas).
- **D. UI** — form de receita (bruto/desconto/tipo/parcelas), Contas a Receber, Ativos,
  relatório DRE (clínica + admin cross-clínica).
- **E. Testes + type-check + lint + build.**

## Status

- [x] **A — modelagem** ✅ schema (Client.taxRegime; Revenue type/grossAmount/discount/status/
      canceledAt; Receivable; FixedAsset; CostType split TAX→TAX_REVENUE + novos); migration
      `20260601100000_dre_competencia` (+ RLS Receivable/FixedAsset) aplicada no Neon; `backfill-dre.ts`
      (1 parcela PAGA por receita); writes de Revenue atualizados (repo + `buildPaidRevenueData` nas
      baixas appointment/lead/pipeline; geração de parcelas no `createRevenue`); refs de `TAX` corrigidas.
- [x] **B — serviço DRE** ✅ `services/dre/`: `calcular-dre` (função pura), `depreciation`
      (linear TANGÍVEL/INTANGÍVEL), `build-dre-input` (mapa input→fonte), `queries/dre-queries`
      (`getDreReport`, gate financial:read + escopo). Testes: 12 (cálculo, depreciação, builder).
- [x] **C — KPIs** ✅ competência: `clinic-kpis` e `getFinancialSummary` excluem `status=CANCELADA`;
      bloco de CAIXA em `getFinancialSummary` (`cash`: recebido no mês / a receber / vencido das parcelas).
- [x] **D — UI** ✅ abas no Financeiro (ordem: Visão Geral, **DRE**, Receitas, Contas a Receber,
      Custos, Ativos, Procedimentos, Relatórios): `dre-tab` (período month/quarter/ano/custom +
      relatório receita→lucro líquido via `getDreReportAction`); `receivables-tab` (marcar pago/
      perdido/reverter); `assets-tab` (CRUD + baixa); form de receita ganhou seletor de **tipo**
      (parcelas já existiam → geram `Receivable`); **cancelar receita** (botão + `cancelRevenueAction`,
      status CANCELADA + parcelas pendentes→CANCELADO); cards de **caixa** no overview
      (recebido/a receber/vencido); **taxRegime** no form da clínica (`/configuracoes`, titular).
      Admin (`clients/[id]/financial`) reusa `FinancialTabs` → ganha tudo.
- [x] **E — validação** ✅ type-check · lint (0 erros) · vitest **151** · build · rls:check:ext · migrate:test+backfill no Neon.

DRE automática (fase 2) COMPLETA.

## Polish (2026-06-01) — 3 pendências menores RESOLVIDAS

- **Editar receita regenera parcelas** ✅ — `updateRevenue` agora, quando muda valor/parcelas/
  forma/data (`scheduleChanged`), regenera as parcelas EM ABERTO via `regenerateReceivables`
  (revenue-repository): preserva PAGO/PERDIDO (caixa/perda já reconhecidos), reparcela o restante
  (`líquido − pago − perdido`), e recomputa o status da venda (QUITADA/ABERTA). Não toca venda
  CANCELADA. Edição que não afeta cronograma segue update escalar simples.
- **Inadimplência com data dedicada** ✅ — `Receivable.writtenOffAt` (migration
  `20260601110000_security_rate_limit_webhook_token`). `setReceivableStatus` seta ao virar
  PERDIDO, limpa ao reverter; `build-dre-input` atribui a inadimplência ao período por
  `writtenOffAt` (não mais `updatedAt`).
- **DRE consolidada cross-clínica do admin** ✅ — `getConsolidatedDreReport` (dre-queries): soma
  os inputs de todas as clínicas da org (calcularDRE é LINEAR → somar inputs = somar saídas, com
  margens corretas sobre o total; o imposto sobre lucro já vem por-regime de cada clínica) + breakdown
  por clínica. Gate de domínio agência (ADMIN/STAFF) + financial:read. UI: seção "DRE Consolidada"
  no Dashboard admin (`modules/financial/consolidated-dre.tsx`, render reusa `dre-report-table.tsx`).

Validação: type-check · lint 0 erros · vitest 163 · build · rls:check:ext, migration no Neon.

## Recebimento no cartão de crédito (2026-06-08) — modo por-clínica

Contrato com a adquirente define como a venda no CRÉDITO entra no financeiro. Config
por-clínica em `Client.creditReceiptMode` (`CreditReceiptMode`: `INSTALLMENTS` default |
`UPFRONT_FEE`) + `Client.creditFeeTiers` (JSON `[{min,max,pct}]` — taxa por faixa de nº de
parcelas). Migration `20260608000000_credit_receipt_mode` (Client é raiz do tenant → sem RLS).

- **INSTALLMENTS (default):** comportamento histórico — N parcelas PENDENTE mês a mês. Zero mudança.
- **UPFRONT_FEE + `paymentMethod = CREDIT_CARD`:** 1 parcela **PAGA à vista** (recebe tudo na venda)
  - um **Cost `FINANCIAL_EXPENSE`** (categoria `Taxa de cartão (antecipação)`) = `amount × pct` da
    faixa do nº de parcelas → entra em _despesas financeiras_ da DRE automaticamente. Outras formas
    (Pix/dinheiro/débito/transferência) **nunca** geram taxa.

Ponto único de decisão: `buildReceivables` (revenue-repository) — devolve `{rows,status,feeCost}`.
Helper PURO `lib/credit-fee.ts` (`isCreditUpfront`/`computeCreditFee`/`feePctForInstallments`/
`parseCreditFeeTiers`, testado). Threading: `createRevenue`, `buildAppointmentRevenueData`
(agenda/pipeline `closeAppointmentCard`), e `updateRevenue` (regen re-sincroniza a linha de taxa
por `category`). `buildPaidRevenueData` (baixa lead/auto sem forma) **não** mexido. Config lida por
request via `getClientCreditConfig`. UI: card owner-only em `/configuracoes`
(`credit-receipt-config-card.tsx` + `updateCreditReceiptConfigAction`).

Validação: type-check · lint 0 · vitest **180** · prisma generate. Neon estava offline (P1001) → o
usuário aplica a migration em prod.

## Unificação DRE + remoção da consolidada (2026-06-08)

- **Aba "Relatórios" REMOVIDA** — era uma DRE simplificada duplicada. A DRE em competência (aba
  **DRE**) é o único lugar; ganhou **Exportar CSV** (linhas via `buildDreRows` exportado de
  `dre-report-table`). Removidos: `reports-tab.tsx`, `report-actions.ts` (`generateDreAction`) e a
  `getDreReport` simplificada de `financial-queries.ts` (mortos).
- **DRE Consolidada do admin REMOVIDA** — a seção do dashboard admin saiu. Removidos:
  `consolidated-dre.tsx`, `getConsolidatedDreReportAction` (dre-actions), `getConsolidatedDreReport`
  - `ConsolidatedDreReport` + `sumDreInputs`/`DRE_INPUT_KEYS` (dre-queries). `getDreReport`
    (por-clínica) e `DreReportTable` permanecem. Validação: type-check · lint 0.
