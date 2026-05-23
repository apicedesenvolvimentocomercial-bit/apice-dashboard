# Auditoria KPI Clinic OS — Relatório de Problemas

**Data:** 2026-05-22 · **Sessão de auditoria:** SA1 · **Escopo:** verificação pós-reforma
"Divisão Total" + caça ao que ainda é compartilhado entre painel Admin/assessoria e Clínica.

> Auditoria, não patch. Nenhum código de produção foi alterado. Este `.md` é o insumo para
> decidir o que mudar. Detalhe por achado abaixo; ledger de progresso em
> [`auditoria-achados.md`](./auditoria-achados.md); reforma em [`reforma-relatorio.md`](./reforma-relatorio.md).

---

## 1. Sumário executivo

A reforma isolou **bem** as 4 áreas que se propôs a isolar (atividades, calendário,
notificações, settings, layout) — com camada tipada `ClinicContext`, 21 testes de isolamento
verdes e componentes separados. **Nenhum P0/P1 encontrado.** O isolamento da clínica funciona
hoje porque toda tela da clínica deriva `clientId` da sessão, nunca de input.

O que sobra são **débitos de defesa-em-profundidade e acoplamento**, todos P2/P3:

- O **núcleo de negócio** (overview, insights, goals, crm, financeiro, pacientes, procedimentos,
  agendamentos) **continua código único compartilhado** entre os dois painéis. "Divisão Total"
  é, na prática, **divisão parcial**.
- Várias queries de leitura compartilhadas **não revalidam `clientId` (`assertClientAccess`) nem
  permissão (`assertCan`)** — confiam no caller. Sem exploit hoje, mas é IDOR/RBAC latente.

### Contagem

| Severidade | Qtde | IDs                                                    |
| ---------- | ---- | ------------------------------------------------------ |
| P0         | 0    | —                                                      |
| P1         | 0    | —                                                      |
| P2         | 6    | CPLX-001, SEC-001, SEC-002, SEC-003, SEC-004, PERF-001 |
| P3         | 2    | BUG-001, SEC-005                                       |

### Top 5 riscos

1. **SEC-001** — read-queries compartilhadas sem `assertClientAccess` (IDOR latente cross-clínica).
2. **SEC-002** — `getPipeline` sem `organizationId` (escopo mais fraco do conjunto).
3. **SEC-004** — read-queries sem `assertCan` (override de `UserPermission` que revoga leitura é ignorado).
4. **CPLX-001** — núcleo de negócio ainda compartilhado (contradiz o DoD da própria reforma).
5. **SEC-003** — webhook sem validação de assinatura/origem (inócuo enquanto mock; arma quando real).

---

## 2. O que ESTÁ bem (não mexer)

Confirmado por leitura de código — registrar para não "consertar" o que funciona:

- **Domínios isolados** `src/domains/clinic/{activities,calendar,notifications}/*`: injetam
  `where.clientId = ctx.clientId` incondicional; 21 testes de isolamento verdes.
- **Export CSV** [`api/export/[clientId]/[resource]/route.ts`](../src/app/api/export/[clientId]/[resource]/route.ts): `auth` + `assertClientAccess` (:84) + todo `where` com `organizationId` + `clientId`. Correto, apesar de shared.
- **PDF** [`api/reports/[clientId]/pdf/route.ts`](../src/app/api/reports/[clientId]/pdf/route.ts): idem (`assertClientAccess` :30, org-scope em todas as queries).
- **Staff** [`staff-actions.ts`](../src/server/actions/staff-actions.ts): `assertCan(ctx,'staff','write')` em toda mutação; transferência de titularidade exige `role==='ADMIN'` (:243).
- **Crons** exigem segredo: `isCronAuthorized(req)` em cada rota.
- **Jobs** (snapshots/reports) iteram por cliente com `organizationId`+`clientId` corretos, concorrência limitada, upsert idempotente.
- **Layout**: cascas burras `components/layout/*-shell` + wrappers `components/{admin,clinic}/*`. Compartilhado legítimo (chrome sem domínio).
- **Modelo de permissão** [`permissions.ts`](../src/server/auth/permissions.ts): defaults por role + override `UserPermission`; ADMIN bypass.

---

## 3. Achados (todos os problemas)

### [CPLX-001] Núcleo de negócio da clínica ainda é código único compartilhado — P2

- **Categoria:** CPLX · **Área:** transversal (telas 5–9)
- **Local:** telas espelho — `src/app/(client)/{overview,goals,insights,crm,financial,patients,procedures,appointments}/page.tsx` importam as MESMAS queries que `src/app/(admin)/clients/[clientId]/<mesma-tela>/page.tsx`:
  - `dashboard-queries.getClinicDashboard` — `(client)/overview/page.tsx:9` ↔ `(admin)/clients/[clientId]/overview/page.tsx:10`
  - `goal-queries.getGoalsWithProgress` — `(client)/goals/page.tsx:6` ↔ `(admin)/.../goals/page.tsx:5`
  - `insight-queries.listInsights` — `(client)/insights/page.tsx:5` ↔ `(admin)/.../insights/page.tsx:4`
  - `lead-queries.getPipelineData` — `(client)/crm/page.tsx:4` ↔ `(admin)/.../crm/page.tsx:5`
  - `appointment-queries.getAppointments/getProcedures` + `patient-queries.getPatients` — `(client)/appointments/page.tsx:8-9` ↔ `(admin)/.../appointments/page.tsx:7-10`
  - `patient-queries.getPatients` — `(client)/patients/page.tsx:4`
  - `financial-queries.getProceduresWithStats` — `(client)/procedures/page.tsx:5`
- **Evidência:** 19 arquivos em `src/server/{actions,queries}` usam `getTenantContext`+`assertClientAccess` (contexto dos 4 roles), não os contextos de domínio `getClinicContext`/`getAdminContext` da reforma. O `permissions.ts` confirma: `CLIENT_OWNER`/`CLIENT_STAFF` têm defaults para todos esses módulos (`financial`, `patients`, `crm`...).
- **Problema:** ~8 telas (maior fatia da clínica) seguem num código único keyed por `clientId`/`role`. Diferença entre painéis = só a origem do `clientId` (clínica: sessão; admin: param `[clientId]`). Contradiz o DoD §7 do `reforma-relatorio.md` ("nenhum action/query/service de feature compartilhado").
- **Cenário de falha:** não é leak (ver Defesa). É manutenção dobrada e a contradição do "divisão total".
- **Defesa existente:** `assertClientAccess` trava `CLIENT_*` à sessão ([context.ts:38-43](../src/server/tenant/context.ts#L38)); telas da clínica passam `clientId` de sessão ([overview:19](<../src/app/(client)/overview/page.tsx#L19>)).
- **Correção sugerida:** decisão de produto. (a) Migrar query a query para `src/domains/clinic/*` com `getClinicContext` (receita das Fases 2-4), OU (b) aceitar o núcleo compartilhado por design e renomear a reforma p/ "parcial". Mudança mínima: começar pelas telas de PII (pacientes/agendamentos).
- **Confiança:** ALTA · **Relação com separação:** é o débito que separa "parcial" de "total".

### [SEC-001] Read-queries compartilhadas não chamam `assertClientAccess` — P2

- **Categoria:** SEC · **Área:** 5/6/7/8
- **Local:**
  - `patient-queries.ts:4` (`getPatients`) → `listPatients(ctx, clientId)` sem validar
  - `appointment-queries.ts:7` (`getAppointments`), `:20` (`getProcedures`)
  - `financial-queries.ts:64` (`getProceduresWithStats`), `:69`, `:74`
  - `lead-queries.ts:4` (`getPipelineData`)
  - `client-queries.ts:12` (`getClient`)
  - Contraste — ESTAS validam: `client-queries.ts:19` (`getClinicUsers`), `goal-queries.ts:16`, `dashboard-queries.ts:295`.
- **Evidência:** wrappers fazem `getTenantContext()` e repassam `clientId` ao repo. Repos filtram `where: { organizationId: ctx.organizationId, clientId }` ([patient-repository.ts:14-15](../src/server/repositories/patient-repository.ts#L14), [appointment-repository.ts:16-17](../src/server/repositories/appointment-repository.ts#L16), [procedure-repository.ts:10-11,29](../src/server/repositories/procedure-repository.ts#L10)) — mas confiam no `clientId` recebido.
- **Problema:** viola §5.3 do prompt principal ("não confiar em `clientId`; validar com `assertClientAccess`"). Barreira de ORG segura; barreira de CLÍNICA depende 100% do caller. Inconsistente (metade valida, metade não).
- **Cenário de exploração:** HOJE não explorável via UI (página injeta `session.user.clientId`). Vira IDOR cross-clínica (mesma org) se qualquer caller futuro passar `clientId` influenciável (action nova, rota de API, query param).
- **Defesa existente:** repos escopam `organizationId`; UI usa clientId de sessão. Nenhuma na camada de query dessas funções.
- **Correção sugerida:** `await assertClientAccess(ctx, clientId)` no topo de cada wrapper (1 linha cada), igualando ao padrão de `getGoalsWithProgress`.
- **Confiança:** ALTA · **Relação com separação:** facilita (fecha barreira de clínica).

### [SEC-002] `getPipeline` filtra estágios só por `clientId`, sem `organizationId` — P2

- **Categoria:** SEC · **Área:** 6 — CRM/Pipeline
- **Local:** [`lead-repository.ts:11`](../src/server/repositories/lead-repository.ts#L11) (`getPipeline`)
- **Evidência:** `prisma.pipelineStage.findMany({ where: { clientId } })` — sem `organizationId`. (Os `leads` aninhados em `:21` filtram `organizationId`+`clientId`; a lista de estágios não.)
- **Problema:** escopo mais fraco do conjunto. Combinado com SEC-001 (sem `assertClientAccess` em `getPipelineData`), `clientId` controlado retornaria estágios de qualquer org.
- **Cenário de exploração:** latente (clientId de sessão na UI). Não explorável hoje.
- **Correção sugerida:** add `organizationId: ctx.organizationId` ao `where` da `pipelineStage.findMany` + `assertClientAccess` no wrapper (SEC-001).
- **Confiança:** ALTA · **Relação com separação:** facilita.

### [SEC-003] Webhook sem validação de assinatura/origem — P2

- **Categoria:** SEC · **Área:** 12 — Integrações
- **Local:** [`api/webhooks/[provider]/route.ts:16-37`](../src/app/api/webhooks/[provider]/route.ts#L16)
- **Evidência:** `POST` aceita qualquer corpo, valida só se `provider ∈ {whatsapp,meta-ads,google-ads}`, loga e responde `ok:true`. Sem checar assinatura HMAC/token/origem. Comentário admite: "No MVP apenas registra o payload… mocks".
- **Problema:** §4.1 SEC ("Webhooks validam assinatura/origem?") → não. Hoje inócuo (não processa nada, provider é mock). Vira vetor (spoof/replay/injeção no pipeline) quando o adapter real for plugado.
- **Cenário de exploração:** qualquer um faz POST → entra no fluxo quando houver processamento real.
- **Defesa existente:** allowlist de provider; nenhum processamento real ainda.
- **Correção sugerida:** ao plugar o adapter de produção, validar assinatura por provider (Meta `X-Hub-Signature-256`, etc.) ANTES de processar. Por ora, documentar como pré-requisito de go-live da integração.
- **Confiança:** ALTA · **Relação com separação:** neutro.

### [SEC-004] Read-queries não chamam `assertCan` — override de permissão ignorado na leitura — P2

- **Categoria:** SEC · **Área:** 5/6/7/8/9
- **Local:** mesmas wrappers do SEC-001 (`getPatients`, `getAppointments`, `getProcedures*`, `getPipelineData`, `getClinicDashboard`, `listInsights`, `getGoalsWithProgress`) — nenhuma chama `assertCan`.
- **Evidência:** `assertCan` ([assert-can.ts:14](../src/server/auth/assert-can.ts#L14)) consulta defaults + override `UserPermission` ([permissions.ts:71](../src/server/auth/permissions.ts#L71)). As mutações (`*-actions.ts`) chamam `assertCan`; as queries de leitura não.
- **Problema:** se um ADMIN revoga, via `UserPermission`, a leitura de um módulo (ex.: `financial read=false`) de um STAFF/CLIENT_STAFF, a query de leitura **ainda retorna o dado** — o gate de RBAC só existe na escrita. Defesa-em-profundidade de leitura ausente.
- **Cenário de exploração:** STAFF com override removendo `financial:read` abre a tela financeira → dado carrega assim mesmo.
- **Defesa existente:** `[NÃO VERIFICADO]` se as `page.tsx`/layouts gateiam leitura com `assertCan` antes de chamar a query — checar nas páginas admin/clínica. Se não gateiam, o override de leitura é decorativo.
- **Correção sugerida:** add `await assertCan(ctx, '<modulo>', 'read')` nas wrappers de leitura (junto do `assertClientAccess` do SEC-001). Verificar primeiro se a página já faz isso para não duplicar.
- **Confiança:** MÉDIA (gate na página não confirmado) · **Relação com separação:** facilita.

### [PERF-001] Crons/jobs processam todos os clientes num passe; `findDue/OverdueActivities` varre tabela inteira — P2

- **Categoria:** PERF · **Área:** 9/10/2
- **Local:** [`jobs/snapshots-job.ts:80`](../src/server/jobs/snapshots-job.ts#L80), [`jobs/reports-job.ts:30`](../src/server/jobs/reports-job.ts#L30), `jobs/insights-job.ts` → `runInsightsForAllClinics`; + `findDueActivities`/`findOverdueActivities` (notif) filtram só `status`+`dueDate` (relatório reforma §6 #1).
- **Evidência:** snapshots/reports fazem `client.findMany` da org inteira e iteram (concorrência 5 / loop serial). Insights idem via engine. Não há filtro de domínio nem paginação por volume.
- **Problema:** não é leak (cada `computeClinicKpis` é escopado por `clientId`; é analytics legítimo da agência). Mas custo/latência cresce linear com nº de clínicas; uma clínica problemática afeta o batch. `findDue/Overdue` sem índice escala mal.
- **Defesa existente:** `isCronAuthorized` (auth do cron) OK; concorrência limitada nos snapshots.
- **Correção sugerida:** medir em prod primeiro. Índice `[status, dueDate]` (ou `[domain, status, dueDate]`) para as activities; paginação/cursor se o volume justificar. Não bloqueia a separação.
- **Confiança:** MÉDIA — `[NÃO VERIFICADO]` interior de `recurring-costs-job` e `runInsightsForAllClinics`.
- **Relação com separação:** neutro.

### [BUG-001] Export engole erro e não valida datas — P3

- **Categoria:** BUG · **Área:** 10 — Export
- **Local:** [`api/export/[clientId]/[resource]/route.ts:282`](../src/app/api/export/[clientId]/[resource]/route.ts#L282) (`} catch {`), e `:89-90` (`new Date(from)`).
- **Evidência:** `catch {}` sem capturar o erro → responde `500 "Export failed"` genérico, mascarando a causa (inclusive um `ForbiddenError` de `assertClientAccess` vira 500 em vez de 403). `new Date(from)`/`new Date(to+'T23:59:59')` sem validar formato → `Invalid Date` silencioso entra no `where`.
- **Problema:** dificulta diagnóstico; status code errado; data inválida pode gerar resultado vazio sem aviso.
- **Correção sugerida:** logar o erro (sem PII) e diferenciar `ForbiddenError`→403, `404`, `500`. Validar `from`/`to` (rejeitar `Invalid Date`).
- **Confiança:** ALTA · **Relação com separação:** neutro.

### [SEC-005] PII (e-mails) em log do job de relatórios — P3

- **Categoria:** SEC (LGPD) · **Área:** 9/10
- **Local:** [`jobs/reports-job.ts:92`](../src/server/jobs/reports-job.ts#L92) (`logger.info('Monthly report sent', { clientId, to })`) — `to` = lista de e-mails de `CLIENT_OWNER`.
- **Evidência:** o array de destinatários (e-mails) entra no log de info.
- **Problema:** §4.1 SEC + LGPD: PII em log. Logs costumam ir para serviço externo/retidos.
- **Correção sugerida:** logar contagem (`recipients: to.length`) em vez dos e-mails, ou mascarar.
- **Confiança:** ALTA · **Relação com separação:** neutro.

---

## 4. Mapa de acoplamento Clínica × Admin (estado atual)

| Recurso                                | Compartilhado?      | Grau             | Evidência                                               |
| -------------------------------------- | ------------------- | ---------------- | ------------------------------------------------------- |
| Atividades / Calendário / Notificações | **NÃO** (isolado)   | —                | `src/domains/clinic/*`                                  |
| Layout / sidebar / topbar              | Casca burra só      | baixo (legítimo) | `components/layout/*-shell`                             |
| Settings                               | NÃO (split)         | —                | `(admin)/settings` vs `(client)/configuracoes`          |
| Overview / Dashboard                   | **SIM**             | alto             | `dashboard-queries.getClinicDashboard`                  |
| Goals                                  | **SIM**             | alto             | `goal-queries`                                          |
| Insights                               | **SIM**             | alto             | `insight-queries` + `services/insights/*`               |
| CRM / Pipeline                         | **SIM**             | alto             | `lead-queries`, `lead-repository`                       |
| Financeiro / Custos / Receita          | **SIM**             | alto             | `financial-queries`, `cost/revenue-actions`             |
| Pacientes (PII)                        | **SIM**             | alto             | `patient-queries`, `patient-repository`                 |
| Procedimentos                          | **SIM**             | alto             | `financial-queries`, `procedure-repository`             |
| Agendamentos                           | **SIM**             | alto             | `appointment-queries`, `appointment-repository`         |
| KPI service                            | **SIM**             | alto             | `services/kpi/*` (usado por overview, PDF, snapshots)   |
| Export CSV / PDF                       | **SIM** (protegido) | alto             | `api/export`, `api/reports`                             |
| Crons/jobs                             | **SIM** (agência)   | médio            | `jobs/{snapshots,reports,insights}`                     |
| Contexto/auth                          | núcleo comum        | —                | `getTenantContext`, `assertClientAccess`, `permissions` |

---

## 5. Veredito de viabilidade (completar a "divisão total")

**Viável com ressalvas.** O isolamento atual é seguro na prática; completar a divisão é
trabalho incremental de baixo risco, não big-bang. Pré-requisitos de segurança (fazer ANTES de
qualquer reuso/exposição nova): **SEC-001 + SEC-002 + SEC-004** — fechar a barreira de clínica e
RBAC na camada de query. Sem isso, mover queries para um contexto de clínica só transfere o furo.

---

## 6. Plano incremental sugerido (cada fase testável e reversível)

1. **Quick wins de segurança (S, baixo risco):** SEC-001 (`assertClientAccess` nas 6 wrappers) +
   SEC-002 (`organizationId` em `getPipeline`) + SEC-004 (`assertCan` read). Resolve 3 dos top 5.
2. **Higiene (S):** BUG-001 (tratamento de erro/data no export) + SEC-005 (PII fora do log).
3. **Hardening de integração (M, quando for plugar real):** SEC-003 (validação de assinatura de webhook).
4. **Performance (M, medir antes):** índice das activities + paginação dos jobs (PERF-001).
5. **Divisão do núcleo (L, decisão de produto):** CPLX-001 — migrar telas compartilhadas para
   `src/domains/clinic/*`, começando pelas de PII (pacientes/agendamentos). Só depois da Fase 1.

## 7. Quick wins (alto valor, baixo custo — dá pra fazer já)

- SEC-001: 6× `await assertClientAccess(ctx, clientId)` (1 linha cada).
- SEC-002: 1× `organizationId: ctx.organizationId` no `where`.
- SEC-005: trocar `{ to }` por `{ recipients: to.length }` no log.
- BUG-001: diferenciar status code + validar datas no export.

> Nada acima foi aplicado. Aguardando decisão sobre quais itens alterar.
