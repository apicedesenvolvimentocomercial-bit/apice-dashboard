# Auditoria de produto + código — achados e gaps vs mercado

> Origem: revisão completa (estática — código lido, app não rodado) pedida em
> 2026-06-02. Cruza o estado do código com pesquisa de padrão de mercado de CRM
> (Salesforce + CRMs de clínica estética 2025). Objetivo: listar código obsoleto/
> órfão, desalinhamentos feature antiga × produto novo, estado real das integrações
> e os gaps de produto priorizados. Ledger vivo — atualizar ao atacar cada item.

## TL;DR

Núcleo **forte e moderno**: pipeline configurável (≤6, `nativeKey`, sync
bidirecional agenda↔funil), DRE em competência + caixa + depreciação + multi-regime,
RLS multi-tenant (belt+suspenders), permissões granulares (cargos lineares,
deny-by-default), segurança (CSP nonce, rate-limit, webhook token por-clínica).

Gap nº1: o produto **mede tudo e age em nada**. Todo o aparato de no-show /
retenção / CAC existe, mas **não há disparo de comunicação real** — WhatsApp é mock,
sem lembrete de agendamento, sem reativação de inativo. É o maior afastamento do
padrão de mercado de CRM de clínica 2025. Há também código de features meio-construídas
(campanhas de marketing, tags, atalho "Ganhou").

---

## 1. Código morto / órfão / não-integrado

| Item                                                                           | Local                                                                                      | Veredito                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MarketingCampaign` (modelo inteiro)                                           | `prisma/schema.prisma:457`; `src/server/services/insights/rules/high-marketing-low-roi.ts` | **MANTIDO por decisão (2026-06-10):** não é abandono — é fundação da feature "campanhas UI" (P1 §priorização). `Cost.campaignId`/`Lead.campaignId` e o recurring-costs-job já o usam. Reavaliar só se o P1 for cortado do roadmap. |
| ~~`winLead` + `winLeadAction`~~                                                | —                                                                                          | **REMOVIDOS (2026-06-10).** Confirmado: morto POR DECISÃO (atalho "Ganhou" extinto por burlar o fluxo Compareceu→Fechado); a cadeia órfã foi apagada de `lead-service.ts` e `lead-actions.ts`.                                     |
| ~~`summarizeUnread`~~                                                          | —                                                                                          | **REMOVIDO (2026-06-10).** Zero importadores; sino usa countUnread\* direto.                                                                                                                                                       |
| `Lead.tags` / `Patient.tags`                                                   | `prisma/schema.prisma:521` e `:570`                                                        | Persistidos e selecionados em query, **nunca renderizados** na UI. Feature de segmentação meio-feita. Exibir + filtrar (tem valor — ver §4) ou remover.                                                                            |
| `Client.lastSnapshotAt`                                                        | `prisma/schema.prisma:214`                                                                 | Lido (client-repository) mas **nunca escrito**. Rótulo "última atualização" quebrado. Popular no snapshots-job ou remover.                                                                                                         |
| `KpiSnapshot.cac` / `roi` / `marketingCost`                                    | `prisma/schema.prisma:1342`                                                                | Dependem de marketing/campanha que não têm input → provavelmente sempre 0/null. Dado potencialmente enganoso no dashboard.                                                                                                         |
| Duplicação: `ingestLead` × `createLead`                                        | `src/server/services/lead-ingest.ts`; `lead-repository`                                    | Lógica de `procedureInterestIds` duplicada nos dois caminhos de criação de lead. Unificar.                                                                                                                                         |
| Duplicação: `Lead.procedureInterest` (string) × `procedureInterestIds` (array) | `prisma/schema.prisma:492`                                                                 | Mantidos em paralelo; a string é exibida, o array só alimenta a soma do valor estimado. Manutenção dobrada.                                                                                                                        |
| Comentários "antigo/removível"                                                 | `src/server/queries/calendar-queries.ts:56`; `src/lib/env.ts:50`                           | Código marcado p/ remoção após migrar callers / após deploys perderem a env. Limpar.                                                                                                                                               |

---

## 2. Feature antiga × produto novo (desalinhamento)

- **Pipeline do ADMIN é legado.** `PipelineDeal` + enum `DealStage`
  (PROSPECT→CONTACTED→PROPOSAL_SENT→NEGOTIATION→WON/LOST, `prisma/schema.prisma:1276`)
  é um funil **estático, hard-coded, 1 negociação ativa por clínica**. O lado clínica,
  porém, ganhou pipelines **configuráveis** (≤6, `nativeKey`, drag de `position`
  fracionária, efeitos de negócio). O admin nunca migrou para o padrão novo —
  ficaram dois sistemas de "funil" com filosofias opostas no mesmo produto.
  Reavaliar (alinhar ao modelo novo ou assumir que o admin é deliberadamente simples).
- **Webhook de ingest meio-pronto.** Rota + token por-clínica + rate-limit estão
  funcionais, mas `verifyProviderSignature` é stub (`return true`,
  `src/server/services/webhook-signature.ts:26`) e não existe adapter real
  (parse de payload Meta/Google/WhatsApp). Ingest existe, integração real não.
- **Insights presumem dados que não entram.** Engine bem construído
  (`src/server/services/insights/engine.ts`), mas as regras de marketing/ROI
  dependem de campanhas órfãs → regra nunca dispara ou dispara com base falsa.

---

## 3. Integrações: estado real vs padrão de mercado

Estado confirmado por varredura do código:

| Integração              | Estado no código                                                                                    | Padrão mercado (clínica 2025)                   |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| WhatsApp / SMS          | **Mock apenas** (`src/server/integrations/whatsapp/mock-provider.ts`; `IWhatsappProvider` definido) | Obrigatório. 2-way text, confirmação 1-clique   |
| Lembrete de agendamento | **Inexistente**                                                                                     | Padrão: 48h + 24h antes; corta no-show até ~30% |
| Reativação de inativo   | **Meio:** `retention-job` marca INACTIVE mas **não dispara nada**                                   | Campanha multi-touch automática                 |
| Email                   | Só transacional (reset / convite / relatório mensal via Resend) — **funcional**                     | Drip / sequências de nurture                    |
| Booking online          | **Inexistente** (agenda é interna)                                                                  | Self-scheduling do paciente = padrão            |
| Pagamento / cobrança    | **Schema-only** (`Revenue.paymentMethod` = texto livre; `Client.monthlyFee` não é cobrado)          | Link pix/cartão, parcelamento                   |
| Calendar sync externo   | **Inexistente** (sem Google/Outlook/CalDAV)                                                         | Comum                                           |
| Reviews / reputação     | **Inexistente**                                                                                     | Pedir review (Google) pós-atendimento           |

Funcionais de verdade (manter): **Email (Resend)**, **Supabase Storage de Documents**
(upload + signed URL, LGPD ok), **7 cron jobs** (recurring-costs, snapshots, insights,
notifications, reports, session-cleanup, retention).

---

## 4. Gaps de produto vs Salesforce + CRM de mercado

Mapa Salesforce core × Senno: lead/opportunity mgmt **✓** (pipeline) · activity
timeline **✓** (atividades + notas + interações) · document mgmt **✓** ·
reports/dashboards **~** (dashboard fixo + DRE; sem report builder) ·
**forecasting ✗** · **workflow/flow automation ✗** · **email templates + tracking ✗** ·
**lead scoring ✗** · **AI next-best-action ✗**.

### Priorização

**P0 — receita direta, padrão de mercado, fundação já existe:**

1. ~~**Lembrete automático de agendamento**~~ — **FEITO (2026-06-10):**
   `appointment-reminders-job` (Inngest 09:00 SP + `/api/cron/appointment-reminders`):
   todo Appointment SCHEDULED/CONFIRMED de AMANHÃ (dia SP) gera o toque — AUTOMATED+
   WhatsApp → fila `OutboundMessage`; MANUAL → Activity atrelada ao paciente com a
   mensagem sugerida. Template `appointment.reminder` (editável por clínica), dedupe
   por appointment+dia (remarcar → lembrete novo). **Provider-agnostic**: quando o
   WhatsApp real entrar (P0.2), o lembrete dispara sozinho sem mudar nada aqui.
   (Variante 48h+24h e confirmação 1-clique ficam p/ quando houver 2-way real.)
2. **Disparo WhatsApp real** — trocar o mock por provider real (Meta Cloud API /
   Z-API / Twilio). A interface `IWhatsappProvider` já existe → falta implementação +
   fila + templates.
3. **Reativação de inativo** — `retention-job` já detecta INACTIVE; ligar a um
   disparo (WhatsApp/email). Hoje é um gatilho sem ação.

**P1:**

4. **Motor de automação leve** ("lead sem contato em 48h → tarefa/mensagem";
   "pós-ATTENDED → pedir review"). Salesforce Flow em versão mínima.
5. **Booking online** — link público de agendamento que cria Lead/Appointment.
6. **Cobrança** — link pix/cartão por `Revenue`/parcela; fecha o loop do módulo de
   Contas a Receber (que hoje só registra, não cobra).
7. **Campanhas de marketing (UI)** — ligar o `MarketingCampaign` já modelado →
   destrava CAC/ROI e as regras de insight de marketing.

**P2:** report builder + export agendado · lead scoring + priorização ·
calendar sync externo (Google/Outlook) · reviews/reputação (review Google pós-ATTENDED).

---

## 5. Forças (manter — são diferenciais de venda)

- **Multi-tenant**: RLS + belt-and-suspenders + `scopedTransaction`. Acima da média.
- **DRE em competência** + bloco de caixa + depreciação + multi-regime tributário
  (`src/server/services/dre/`). Diferencial forte vs CRM genérico — vende sozinho
  para clínica no Brasil.
- **Pipeline configurável** com sync bidirecional agenda↔funil. Bem arquitetado.
- **Permissões**: cargos hierárquicos lineares, deny-by-default, coroa de titular.
- **Segurança**: CSP com nonce, rate-limit no Postgres, webhook token por-clínica,
  documentos sensíveis (LGPD) em bucket privado com URL assinada.

---

## Próximo passo sugerido

Atacar **P0.1 (lembrete) + P0.2 (WhatsApp real)** juntos — mesma fundação (provider +
fila + templates de mensagem) e destravam de uma vez lembrete, reativação e a base do
motor de automação (P1.4). Detalhar plano técnico antes de implementar.

---

## Anexo — pesquisa de mercado (fontes)

Padrões coletados em 2026-06-02 (busca web), usados na §3/§4:

**Salesforce / CRM genérico**

- Core do Sales Cloud: lead/opportunity, contact/account, forecasting, reports &
  dashboards em tempo real, document management, workflow automation, e (2025+)
  agentes de IA (Agentforce) p/ prospecção e próxima-melhor-ação.
  - https://www.salesforce.com/sales/cloud/guide/
  - https://www.techforceacademy.com/salesforce-sales-cloud-features-guide/
- Activities / Flow / Email: timeline de atividade por contato/lead, criação
  automática de Task ao logar email, Flow dispara follow-up quando não há atividade
  em N dias, templates com conteúdo condicional, métricas "Last Email Sent/Received".
  - https://www.salesforceben.com/salesforce-activities-everything-you-need-to-know/
  - https://help.salesforce.com/s/articleView?id=sales.forecasts3_intro.htm
- Must-have CRM 2025: sequências de email/drip, lead scoring, pipeline reporting,
  integrações no/low-code (WhatsApp/Messenger/LinkedIn), automação com IA,
  comunicação omnichannel (email, SMS, chat, telefone) num só lugar.
  - https://www.onepagecrm.com/blog/crm-features/
  - https://www.lupodigital.com/blog/top-crm-features-business-this-year

**Clínica estética / saúde**

- Software de clínica 2025: cadastro completo do paciente, agendamento, lembretes
  automáticos (SMS/email), automação de marketing, POS/membership, IA p/ otimizar
  agenda e prever preferências (Zenoti, Aesthetix, Pabau, Aesthetic Record).
  - https://pabau.com/blog/best-aesthetic-clinic-software/
  - https://aesthetixcrm.com/
- No-show: lembretes 48h + 24h com confirmação 1-clique e 2-way text reduzem
  significativamente; no-shows cortam receita até ~30%; protocolo pós-falta
  (link de reagendamento em 24h, ligação em 72h).
  - https://curogram.com/blog/average-patient-no-show-rate
  - https://www.mediverticals.com/blog/how-to-reduce-no-show-appointments/
- Reativação de paciente: campanha multi-touch p/ quem não volta há 6–24 meses;
  reativar custa até 5× menos que adquirir novo; SMS tem maior taxa de resposta,
  email bom p/ promoções detalhadas; incentivos por tempo limitado convertem.
  - https://clinicenvy.com/reactivating-inactive-patients-the-power-of-patient-reactivation-campaigns/
  - https://www.practicebuilders.com/blog/patient-reactivation-strategies-tips-and-best-practices/
- Reputação: pedir review pós-atendimento, análise de sentimento, gestão de
  avaliações como fonte de aquisição e retenção.
  - https://birdeye.com/blog/healthcare-reputation-management/
