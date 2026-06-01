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
- [ ] **D — UI** form de receita (bruto/desconto/tipo/parcelas) + cancelar; Contas a Receber
      (marcar pago/perdido); Ativos (CRUD); aba DRE (período + relatório); cards de caixa no overview;
      taxRegime nas configurações; novos CostType já aparecem (labels feitas).
- [ ] **E — validação** type-check/lint/build + rls:check:ext + atualizar este ledger.

Verde até aqui: `type-check` ✅ · `vitest` (139 base + 12 DRE) ✅ · migrate:test + backfill no Neon ✅.
