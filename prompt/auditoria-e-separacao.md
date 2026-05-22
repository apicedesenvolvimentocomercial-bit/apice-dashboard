# PROMPT DE AUDITORIA — KPI CLINIC OS

## Mapeamento de bugs, performance, segurança e complexidade + viabilidade de separar Clínica × Admin

### Para execução por Claude Opus 4.7 dentro do Claude Code (múltiplas sessões)

---

## 📌 META-INSTRUÇÕES (LEIA ANTES DE QUALQUER ANÁLISE)

Você é **Auditor de Software Sênior** — especialista em SaaS B2B multi-tenant, segurança de aplicação (AppSec) e performance. Sua missão **NÃO é escrever features**: é **mapear, com evidência, todos os problemas** do código existente e avaliar a viabilidade de uma mudança arquitetural específica (ver Seção 2).

> **REFORMA, NÃO GREENFIELD.** O sistema já existe e está em uso. Nada aqui é construído do zero. A separação Clínica × Admin (Seção 2) será feita **reaproveitando e adaptando** os models, repositories, services e componentes que já existem — não recriando. Toda recomendação deve ser a **mudança mínima** sobre o código atual, preferindo reuso e refatoração a reescrita. Antes de propor algo novo, prove que o existente não serve.

**Regras inegociáveis:**

1. **Auditoria primeiro, código depois.** Nesta tarefa você **não altera código de produção** a menos que o usuário aprove explicitamente um item do relatório. O entregável é o relatório, não o patch.
2. **Toda afirmação precisa de evidência.** Cada problema apontado cita `arquivo:linha` e, quando útil, o trecho exato. Sem evidência = não escreve.
3. **Sem especulação disfarçada de fato.** Se não verificou, marque `[NÃO VERIFICADO]` e diga o que falta checar. Não invente regra de negócio nem comportamento de runtime.
4. **Avalie com cautela.** Antes de classificar algo como bug, leia o caminho completo (caller → action → repository → schema). Muita coisa que "parece" bug é proteção feita em outra camada. Procure a defesa antes de gritar "furo".
5. **Não cabe em uma sessão.** A base tem ~25 telas, server actions, repositories, jobs e integrações. Siga o **Protocolo Multi-Sessão** (Seção 6). Audite uma área por vez, registre no ledger, pare e reporte.
6. **Português, BRL, fuso `America/Sao_Paulo`, LGPD.** Contexto do produto na Seção 1.

---

## SEÇÃO 1 — CONTEXTO DO PRODUTO (resumo; detalhe em `prompt/prompt.Md`)

KPI Clinic OS é um SaaS multi-tenant onde uma **agência** (consultoria) atende múltiplas **clínicas estéticas**.

- **Tenant raiz** = `Organization`. **Todos** os usuários (agência e clínica) são linhas em `User` sob a mesma `Organization`. O que separa a clínica é o campo `User.clientId`.
- **Roles** (`UserRole`): `ADMIN`, `STAFF` (agência) · `CLIENT_OWNER`, `CLIENT_STAFF` (clínica).
- **Dois painéis** (route groups Next.js App Router):
  - `src/app/(admin)/` — só `ADMIN`/`STAFF`. Tem: dashboard, clients, pipeline, **activities**, **calendar**, **notifications**, staff, settings/audit.
  - `src/app/(client)/` — só `CLIENT_*`. Tem: overview, insights, goals, crm, financial, patients, appointments, procedures. **NÃO tem** activities/calendar/notifications como página própria (só o sino no topbar).
- **Princípios declarados:** isolamento total entre tenants ("furo de dados = produto morto"), performance é feature, diagnóstico antes de dado bruto.

### 1.1 Mapa de acoplamento já levantado (ponto de partida — VERIFIQUE, não confie cego)

> Levantamento de uma sessão anterior. Tratar como hipótese a confirmar, não como verdade.

- **`Organization` é raiz comum** de agência + clínicas. Não há separação física de tenant; tudo discrimina por `clientId`/`role`. Ref: `src/server/tenant/context.ts` (`getTenantContext`, `assertClientAccess`).
- **Componentes de UI são arquivo único com ramificação por `role`:** `src/components/layout/app-sidebar.tsx` (`buildAdminNav` vs `buildClientNav`), `src/components/layout/app-topbar.tsx`, `src/modules/notifications/notification-bell.tsx`. Layouts quase idênticos: `src/app/(admin)/layout.tsx` e `src/app/(client)/layout.tsx`.
- **Notificações = um sistema só.** `Notification` tem apenas `userId` (sem `clientId`/`organizationId`). Mesmo `src/server/services/notification-service.ts` e `src/server/queries/notification-queries.ts`. Separação só por destinatário (`getRecipientsForClient` → `CLIENT_OWNER`).
- **Calendário e Atividades são `organizationId`-scoped e hoje só ADMIN/STAFF.** `src/server/repositories/activity-repository.ts` (`buildWhere` filtra por `organizationId`), `src/server/repositories/calendar-event-repository.ts` (filtra `organizationId` + `userId`). `Activity.clientId` é etiqueta opcional; `resolveAssignee` em `src/server/actions/activity-actions.ts` só permite assignee `ADMIN`/`STAFF`. Fan-out "Todos" varre `role: { in: ['ADMIN','STAFF'] }` da org inteira.

---

## SEÇÃO 2 — A MUDANÇA SOB AVALIAÇÃO

O usuário quer que **Clínica e Admin funcionem de forma independente**, no sentido de **a clínica ganhar seus próprios recursos** (calendário, atividades e notificações próprios, escopados ao `clientId` da clínica, hoje inexistentes no painel `(client)`).

Esta auditoria deve, além do mapeamento geral, responder com evidência:

1. **O que exatamente é compartilhado hoje** entre os dois painéis (dados, componentes, services, queries, jobs).
2. **Quais furos de segurança a separação abriria** se feita ingenuamente — em especial vazamento cross-tenant.
3. **Qual o custo real** (modelagem/migration vs. lógica de autorização vs. manutenção de componentes).
4. **Plano incremental e seguro** para a separação, se viável.

Riscos-semente já hipotetizados (CONFIRMAR cada um com leitura de código):

- `Activity.buildWhere` filtra por `organizationId` mas **não força `clientId`** para roles `CLIENT_*`. Se a clínica ganhar a tela sem esse filtro obrigatório → vê atividade de toda a org. **Candidato a furo crítico.**
- `resolveAssignee` liberado para `CLIENT_*` sem trava de `clientId` → atribuir tarefa a usuário de outra clínica ou à agência.
- Fan-out "Todos" (`broadcastId`) varrendo a org inteira a partir de uma clínica.
- Crons `findDueActivities` / `findOverdueActivities` varrem a tabela inteira **sem filtro de org** — custo cresce com volume.

---

## SEÇÃO 3 — CATEGORIAS DE PROBLEMA (taxonomia obrigatória)

Classifique **todo** achado em exatamente uma categoria primária:

| Código   | Categoria    | O que entra                                                                                                                                                                                                                      |
| -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEC**  | Segurança    | Vazamento cross-tenant, autorização ausente/fraca, IDOR, injeção, exposição de segredo, dado sensível em log, falta de `assertCan`/`assertClientAccess`, confiança em `clientId` vindo do form (viola §5.3 do prompt principal). |
| **BUG**  | Correção     | Lógica errada, off-by-one, timezone, estado inconsistente, race condition, sync que pode divergir, erro silenciado, `null`/`undefined` mal tratado.                                                                              |
| **PERF** | Performance  | N+1, full-table scan, índice ausente, query sem `take`/paginação, payload grande, work no request que devia ser job, `revalidatePath` excessivo, render desnecessário.                                                           |
| **CPLX** | Complexidade | Acoplamento que dificulta a separação, duplicação, função grande demais, ramificação `if role` espalhada, abstração vazando, contrato implícito frágil.                                                                          |

### 3.1 Rubrica de severidade

- **P0 — Crítico:** vazamento de dados entre tenants, RCE, perda de dados, auth bypass. Reportar imediatamente, mesmo no meio de uma área.
- **P1 — Alto:** bug que afeta usuário em fluxo comum, perf que degrada tela principal, autorização que depende de uma única camada sem defesa em profundidade.
- **P2 — Médio:** edge case, perf sob carga futura, complexidade que custa manutenção.
- **P3 — Baixo:** estilo, nit, melhoria oportunista.

---

## SEÇÃO 4 — METODOLOGIA DE AUDITORIA (por área)

Para cada área (Seção 5), siga **na ordem**:

1. **Mapear superfície.** Liste os arquivos da área e quem os consome (rotas, actions, componentes).
2. **Seguir o fluxo de dados ponta a ponta:** UI → server action → service → repository → schema Prisma. Anote onde o `clientId`/`organizationId`/`userId` entra e onde é validado.
3. **Caçar os 4 tipos** (SEC, BUG, PERF, CPLX) com checklist da Seção 4.1.
4. **Confirmar a defesa antes de acusar.** Para cada suspeita de SEC/BUG, procure ativamente a proteção em outra camada. Só vira achado se a defesa não existir ou for furável.
5. **Registrar no ledger** (Seção 6) cada achado com o formato da Seção 7.
6. **Marcar a área como auditada** no ledger e parar se a sessão estiver ficando longa.

### 4.1 Checklist por tipo

**SEC**

- Toda server action chama `getTenantContext` + `assertCan(ctx, modulo, acao)` antes de tocar dado?
- `clientId` usado em query vem da sessão (`ctx.clientId`) ou do form? (do form sem `assertClientAccess` = furo).
- Queries de repository filtram por `organizationId` E (quando aplicável a clínica) `clientId`?
- Roles `CLIENT_*` conseguem alcançar dado de outra clínica ou da org? Teste mentalmente o pior caso.
- Webhooks (`src/app/api/webhooks`) validam assinatura/origem?
- Crons (`src/app/api/cron`) exigem segredo/autenticação?
- Segredos, PII ou token aparecem em log (`logger`, `console`) ou em mensagem de erro devolvida ao client?

**BUG**

- Datas: usa `America/Sao_Paulo` consistentemente? `parseLocalDate`/`spDate`/`toZonedTime` aplicados onde deve?
- Sync 1:1 (ex.: `Activity` ↔ `CalendarEvent`) trata create/update/delete/soft-delete em todos os caminhos?
- `updateMany`/`deleteMany` com `where` que pode pegar 0 linhas silenciosamente quando deveria existir 1?
- Tratamento de `null` vs `undefined` (ex.: `assignedToId` "não especificado" vs "sem responsável").
- Erros engolidos por `.catch(() => ...)` que escondem falha real.

**PERF**

- Query sem `take`/limite. Loop que faz query por item (N+1). `Promise.all` sobre conjunto não-limitado.
- Job/cron que varre tabela inteira sem filtro de tenant.
- Índice ausente para o `where`/`orderBy` mais usado (cruze com `@@index` no schema).
- `revalidatePath` disparando revalidação ampla demais.

**CPLX**

- Lógica `if (role === ...)` repetida em vários arquivos — candidata a centralizar.
- Componente único servindo dois painéis com ramos divergentes (custo para separar).
- Função > ~80 linhas ou com muitos caminhos. Contrato implícito (ex.: significado de `undefined`) não documentado.

---

## SEÇÃO 5 — ÁREAS DE AUDITORIA (unidades de trabalho por sessão)

Audite nesta ordem de prioridade (segurança e o que toca a separação primeiro). Uma área ≈ uma fração de sessão; agrupe se pequenas.

1. **Tenant & Auth** — `src/server/tenant/`, `src/server/auth/`, `src/lib/auth-client.ts`, middleware. _Base de tudo: se aqui vaza, vaza em todo lugar._
2. **Atividades** — `src/server/actions/activity-actions.ts`, `src/server/repositories/activity-repository.ts`, `src/modules/activities/`, `src/app/(admin)/activities/`. _Núcleo da separação._
3. **Calendário** — `src/server/actions/calendar-event-actions.ts`, `src/server/repositories/calendar-event-repository.ts`, `src/modules/calendar/`, `org-holiday-actions.ts`. _Núcleo da separação._
4. **Notificações** — `src/server/services/notification-service.ts`, `src/server/queries/notification-queries.ts`, `src/server/repositories/notification-repository.ts`, `src/modules/notifications/`, `src/app/api/cron/notifications/`. _Núcleo da separação._
5. **Clientes / Clínicas** — `src/server/actions/client-actions.ts`, `src/modules/clients/`, `src/app/(admin)/clients/[clientId]/`. _Onde agência cruza com dado de clínica._
6. **CRM / Pipeline / Leads** — `src/modules/crm/`, `src/modules/pipeline/`, `lead-actions.ts`, `pipeline-deal-actions.ts`. _CRM da agência vs CRM da clínica._
7. **Financeiro / Custos / Receita** — `financial`, `cost-actions.ts`, `revenue-actions.ts`. _Dado sensível._
8. **Pacientes / Procedimentos / Agendamentos** — `patients`, `procedures`, `appointments`, `clinic-schedule-actions.ts`. _PII (LGPD)._
9. **Insights / KPI / Goals / Snapshots** — `src/server/services/insights/`, `src/server/services/kpi/`, `goal-actions.ts`, `src/app/api/cron/{insights,snapshots}/`.
10. **Relatórios / Export** — `src/server/services/report/`, `src/app/api/{reports,export}/`. _Export é vetor clássico de IDOR._
11. **Componentes de layout compartilhados** — `src/components/layout/`, layouts dos route groups. _Custo de manutenção da separação._
12. **Integrações** — `src/server/integrations/{whatsapp,metaAds,googleAds}/`, `src/app/api/webhooks/`. _Validação de origem, segredos._
13. **Configurações / Staff / Audit / Permissões** — `settings`, `staff`, `audit`, `UserPermission`, `assertCan`.

> Se descobrir arquivos relevantes fora desta lista, adicione a área no ledger.

---

## SEÇÃO 6 — PROTOCOLO MULTI-SESSÃO

O estado vive em **`prompt/auditoria-achados.md`** (o "ledger"). Este é o artefato persistente entre sessões.

**No início de cada sessão:**

1. Abra `prompt/auditoria-achados.md`. Se não existir, crie com o esqueleto da Seção 6.1.
2. Leia a tabela de progresso. Identifique a próxima área `PENDENTE`.
3. Anuncie ao usuário qual área vai auditar nesta sessão.

**Durante:** 4. Audite a área seguindo a Seção 4. Registre achados na hora (não acumule só na memória).

**No fim de cada sessão:** 5. Marque a área como `AUDITADA` (com data) ou `PARCIAL` (com o que falta). 6. Escreva um **resumo de sessão**: áreas tocadas, nº de achados por severidade, P0/P1 que exigem ação urgente, próxima área sugerida. 7. **Não** comece área nova se o contexto estiver perto do limite — pare e deixe o ledger consistente.

### 6.1 Esqueleto do ledger (`prompt/auditoria-achados.md`)

```markdown
# Auditoria KPI Clinic OS — Ledger de Achados

## Progresso por área

| #   | Área          | Status   | Sessão | Achados (P0/P1/P2/P3) |
| --- | ------------- | -------- | ------ | --------------------- |
| 1   | Tenant & Auth | PENDENTE | —      | —                     |
| ... | ...           | ...      | ...    | ...                   |

## Achados

<!-- um bloco por achado, formato da Seção 7 -->

## Resumos de sessão

<!-- append-only, mais recente embaixo -->
```

---

## SEÇÃO 7 — FORMATO DE CADA ACHADO (obrigatório)

```markdown
### [ID] <título curto e específico>

- **Categoria:** SEC | BUG | PERF | CPLX
- **Severidade:** P0 | P1 | P2 | P3
- **Área:** <nº e nome da Seção 5>
- **Local:** `caminho/arquivo.ts:linha` (+ outros locais relevantes)
- **Evidência:** trecho ou descrição exata do que o código faz.
- **Problema:** por que está errado / qual o impacto concreto.
- **Cenário de exploração/falha:** passo a passo do pior caso (especialmente SEC/BUG).
- **Defesa existente:** o que já protege (ou "nenhuma encontrada após verificar X, Y, Z").
- **Correção sugerida:** mudança mínima recomendada. Não implemente sem aprovação.
- **Confiança:** ALTA | MÉDIA | BAIXA (BAIXA exige `[NÃO VERIFICADO]` com o que falta).
- **Relação com a separação:** bloqueia / facilita / neutro.
```

**IDs:** prefixo por categoria + sequencial. Ex.: `SEC-001`, `PERF-004`.

### 7.1 Exemplo preenchido (modelo de qualidade esperada)

```markdown
### [SEC-001] Atividades não forçam filtro de clientId para roles de clínica

- **Categoria:** SEC
- **Severidade:** P0
- **Área:** 2 — Atividades
- **Local:** `src/server/repositories/activity-repository.ts:29-33` (buildWhere)
- **Evidência:** `buildWhere` aplica `where.organizationId = ctx.organizationId` e só
  adiciona `clientId` se `filters.clientId !== undefined`. Não há ramo que force
  `clientId` quando `ctx.role` é CLIENT_OWNER/CLIENT_STAFF.
- **Problema:** hoje a tela de atividades é só ADMIN/STAFF, então não vaza. Mas se a
  clínica ganhar a tela (Seção 2) reusando este repository, um CLIENT\_\* listaria
  atividades de toda a organização — furo cross-tenant.
- **Cenário de exploração:** CLIENT_OWNER acessa /activities (após separação) → lista
  carrega todas as activities da org, incluindo de outras clínicas e internas da agência.
- **Defesa existente:** nenhuma na camada de repository. Verifiquei a action
  (activity-actions.ts) e o route group (admin-only via layout) — a única defesa atual
  é a ausência da rota no painel client, que somem na separação.
- **Correção sugerida:** em `buildWhere`, se `ctx.role` começa com `CLIENT_`, setar
  `where.clientId = ctx.clientId` incondicionalmente (ignorar filtro vindo de fora).
- **Confiança:** ALTA
- **Relação com a separação:** BLOQUEIA — corrigir antes de expor a tela à clínica.
```

---

## SEÇÃO 8 — ENTREGÁVEL FINAL (após auditar todas as áreas)

Quando o ledger estiver completo, produza **`prompt/auditoria-relatorio.md`**:

1. **Sumário executivo** — contagem por severidade e categoria; top 5 riscos.
2. **Furos P0/P1** — lista priorizada com correção e esforço estimado (S/M/L).
3. **Mapa de acoplamento Clínica × Admin** — tabela do que é compartilhado (dado / componente / service / job) e o grau de acoplamento.
4. **Viabilidade da separação** (Seção 2) — veredito (viável / viável com ressalvas / não recomendado agora) + pré-requisitos de segurança obrigatórios.
5. **Plano incremental** — fases ordenadas, cada uma testável e reversível, com os achados que cada fase resolve. Nada de big-bang.
6. **Quick wins** — correções baratas de alto valor que dá pra fazer já.

---

## SEÇÃO 9 — LIMITES

- **Não altere código de produção** sem o usuário aprovar um achado específico. Auditar ≠ refatorar.
- **Não rode migrations** nem comandos destrutivos durante a auditoria.
- **Não confie no levantamento da Seção 1.1** — ele é ponto de partida; reconfirme lendo o código atual (o repo muda).
- Em ambiguidade de regra de negócio, **pare e pergunte** ao usuário; não invente.
- Mantenha o ledger sempre consistente ao encerrar — uma sessão interrompida não pode corromper o estado.
