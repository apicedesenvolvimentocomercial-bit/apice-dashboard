# Auditoria KPI Clinic OS — Ledger de Achados

> Contexto: a "Reforma Divisão Total" (Fases 0–8) já foi executada — ver
> [`reforma-relatorio.md`](./reforma-relatorio.md) e [`reforma-progresso.md`](./reforma-progresso.md).
> Esta auditoria verifica a QUALIDADE dessa separação e caça o que ainda é
> compartilhado entre o painel Admin/assessoria e o painel Clínica.

## Progresso por área

| #   | Área                                      | Status   | Sessão           | Achados (P0/P1/P2/P3)                |
| --- | ----------------------------------------- | -------- | ---------------- | ------------------------------------ |
| 1   | Tenant & Auth                             | PARCIAL  | SA1 (2026-05-22) | 0/0/0/0 (lido `assertClientAccess`)  |
| 2   | Atividades                                | PENDENTE | —                | — (isolado na reforma)               |
| 3   | Calendário                                | PENDENTE | —                | — (isolado na reforma)               |
| 4   | Notificações                              | PENDENTE | —                | — (isolado na reforma)               |
| 5   | Clientes / Clínicas                       | AUDITADA | SA1 (2026-05-22) | 0/0/1/0                              |
| 6   | CRM / Pipeline / Leads                    | AUDITADA | SA1 (2026-05-22) | 0/0/1/0                              |
| 7   | Financeiro / Custos / Receita             | AUDITADA | SA1 (2026-05-22) | 0/0/1/0                              |
| 8   | Pacientes / Procedimentos / Agend.        | AUDITADA | SA1 (2026-05-22) | 0/0/1/0                              |
| 9   | Insights / KPI / Goals / Snapshots        | AUDITADA | SA1 (2026-05-22) | 0/0/1/1 (PERF-001, SEC-005)          |
| 10  | Relatórios / Export                       | AUDITADA | SA1 (2026-05-22) | 0/0/0/1 (BUG-001; rotas gateadas OK) |
| 11  | Layout compartilhado                      | AUDITADA | SA1 (2026-05-22) | 0/0/0/0 (cascas burras OK)           |
| 12  | Integrações                               | AUDITADA | SA1 (2026-05-22) | 0/0/1/0 (SEC-003 webhook)            |
| 13  | Config / Staff / Audit / Permissões       | AUDITADA | SA1 (2026-05-22) | 0/0/1/0 (SEC-004 RBAC read)          |
| —   | Acoplamento Clínica × Admin (transversal) | AUDITADA | SA1 (2026-05-22) | 1 CPLX + 1 PERF                      |

## Achados

### [CPLX-001] Núcleo de negócio da clínica ainda é código único compartilhado com o admin

- **Categoria:** CPLX
- **Severidade:** P2
- **Área:** transversal (5/6/7/8/9)
- **Local:** telas espelho —
  `src/app/(client)/{overview,goals,insights,crm,financial,patients,procedures,appointments}/page.tsx`
  importam as MESMAS queries que `src/app/(admin)/clients/[clientId]/<mesma-tela>/page.tsx`:
  - `dashboard-queries.getClinicDashboard` — `(client)/overview/page.tsx:9` ↔ `(admin)/clients/[clientId]/overview/page.tsx:10`
  - `goal-queries.getGoalsWithProgress` — `(client)/goals/page.tsx:6` ↔ `(admin)/.../goals/page.tsx:5`
  - `insight-queries.listInsights` — `(client)/insights/page.tsx:5` ↔ `(admin)/.../insights/page.tsx:4`
  - `lead-queries.getPipelineData` — `(client)/crm/page.tsx:4` ↔ `(admin)/.../crm/page.tsx:5`
  - `appointment-queries.getAppointments/getProcedures` + `patient-queries.getPatients` — `(client)/appointments/page.tsx:8-9` ↔ `(admin)/.../appointments/page.tsx:7-10`
  - `patient-queries.getPatients` — `(client)/patients/page.tsx:4`
  - `financial-queries.getProceduresWithStats` — `(client)/procedures/page.tsx:5`
- **Evidência:** 19 arquivos em `src/server/{actions,queries}` usam `getTenantContext` +
  `assertClientAccess` (contexto compartilhado dos 4 roles), não os contextos de domínio
  `getClinicContext`/`getAdminContext` introduzidos na reforma. A reforma só migrou
  atividades/calendário/notificações/settings/layout para `src/domains/clinic/*`.
- **Problema:** a reforma se chama "Divisão Total" mas o relatório (§6 #6) admite e a leitura
  confirma: ~8 telas (a maior fatia da superfície da clínica) continuam num único código
  keyed por `clientId`/`role`. Diferença entre os painéis = só a origem do `clientId`
  (clínica: `session.user.clientId`; admin: param de rota `[clientId]`).
- **Cenário de falha:** não é leak (ver defesa). É custo de manutenção e contradição do DoD §7
  ("nenhum action/query/service de feature compartilhado").
- **Defesa existente:** `assertClientAccess` trava `CLIENT_*` à própria sessão
  (`context.ts:38-43`); telas da clínica passam `clientId` da sessão, não de form
  (`(client)/overview/page.tsx:19`). Isolamento funciona — só não está "dividido".
- **Correção sugerida:** decisão de produto. Se "divisão total" deve alcançar essas telas,
  migrar query por query para `src/domains/clinic/*` com `getClinicContext` (mesma receita
  das Fases 2-4). Caso contrário, renomear a reforma p/ "divisão parcial" e documentar que
  o núcleo é compartilhado por design.
- **Confiança:** ALTA
- **Relação com a separação:** é o débito principal que separa "parcial" de "total".

### [SEC-001] Read-queries compartilhadas não chamam `assertClientAccess` (defesa-em-profundidade ausente)

- **Categoria:** SEC
- **Severidade:** P2
- **Área:** 5/6/7/8
- **Local:**
  - `src/server/queries/patient-queries.ts:4` (`getPatients`) → `listPatients(ctx, clientId)` sem `assertClientAccess`
  - `src/server/queries/appointment-queries.ts:7` (`getAppointments`), `:20` (`getProcedures`)
  - `src/server/queries/financial-queries.ts:64` (`getProceduresWithStats`), `:69`, `:74`
  - `src/server/queries/lead-queries.ts:4` (`getPipelineData`)
  - `src/server/queries/client-queries.ts:12` (`getClient`)
  - Contraste — ESTAS validam: `client-queries.ts:19` (`getClinicUsers`), `goal-queries.ts:16`, `dashboard-queries.ts:295`.
- **Evidência:** os wrappers acima fazem `const ctx = await getTenantContext()` e repassam
  `clientId` direto ao repositório. Os repos filtram `where: { organizationId: ctx.organizationId, clientId }`
  (`patient-repository.ts:14-15`, `appointment-repository.ts:16-17`, `procedure-repository.ts:10-11,29`),
  mas confiam no `clientId` recebido — não revalidam contra a sessão.
- **Problema:** viola §5.3 do prompt principal ("não confiar em `clientId`; validar com
  `assertClientAccess`"). A barreira de ORG segura (organizationId vem sempre do ctx), mas a
  barreira de CLÍNICA depende 100% do caller passar o id certo. Inconsistente: metade das
  wrappers valida, metade não.
- **Cenário de exploração:** HOJE não explorável via UI da clínica — a página injeta
  `session.user.clientId` (não há input de outro id). Vira IDOR cross-clínica (mesma org) se
  QUALQUER caller futuro passar `clientId` influenciável (nova action, rota de API, query param).
- **Defesa existente:** repos escopam `organizationId`; telas da clínica usam clientId de sessão.
  Nenhuma defesa na camada de query para essas funções.
- **Correção sugerida:** adicionar `await assertClientAccess(ctx, clientId)` no topo de cada
  wrapper listado (mudança mínima, 1 linha cada), igualando ao padrão de `getGoalsWithProgress`.
- **Confiança:** ALTA
- **Relação com a separação:** facilita — fecha a barreira de clínica antes de qualquer reuso.

### [SEC-002] `getPipeline` filtra estágios só por `clientId`, sem `organizationId`

- **Categoria:** SEC
- **Severidade:** P2
- **Área:** 6 — CRM / Pipeline
- **Local:** `src/server/repositories/lead-repository.ts:11` (`getPipeline`)
- **Evidência:** `prisma.pipelineStage.findMany({ where: { clientId } })` — sem
  `organizationId`. (Os `leads` aninhados em `:21` filtram `organizationId` + `clientId`, mas a
  lista de estágios em si não.)
- **Problema:** é a query com escopo mais fraco do grupo. Combinada com SEC-001 (sem
  `assertClientAccess` em `getPipelineData`), um `clientId` controlado retornaria estágios de
  pipeline de qualquer org.
- **Cenário de exploração:** não explorável hoje (clientId de sessão na UI da clínica). Latente.
- **Defesa existente:** caller passa clientId de sessão. Nenhuma na query de estágios.
- **Correção sugerida:** adicionar `organizationId: ctx.organizationId` ao `where` da
  `pipelineStage.findMany` + `assertClientAccess` no wrapper (SEC-001).
- **Confiança:** ALTA
- **Relação com a separação:** facilita.

### [PERF-001] Crons processam ambos os domínios num passe único, sem split/escopo

- **Categoria:** PERF
- **Severidade:** P2
- **Área:** 9/10
- **Local:** `src/app/api/cron/{insights,snapshots,recurring-costs,reports}/route.ts` →
  jobs em `src/server/jobs/*`. (Só `cron/notifications` ganhou `domainRouting` na Fase 8.)
- **Evidência:** `cron/insights/route.ts:16` chama `runInsightsJob()` sem filtro de domínio.
  Confirmar nos jobs de snapshots/reports/recurring-costs o mesmo padrão (varredura por
  client da org inteira).
- **Problema:** não é leak (analytics da agência sobre as clínicas dela é legítimo), mas é
  processamento cross-domínio único — escala com o nº total de clínicas e não permite isolar
  custo/falha por domínio. Resíduo conhecido (relatório §6 #1: `findDue/OverdueActivities`
  varre tabela toda sem `clientId`).
- **Cenário de falha:** custo/latência crescente; uma clínica problemática afeta o batch todo.
- **Defesa existente:** crons exigem segredo (`isCronAuthorized`, `cron/insights/route.ts:11`). OK.
- **Correção sugerida:** medir em prod primeiro; índice `[status,dueDate]`/`[domain,status,dueDate]`
  - paginação por clínica se o volume justificar. Não é bloqueador da separação.
- **Confiança:** MÉDIA — `[NÃO VERIFICADO]` o interior de snapshots/reports/recurring-costs jobs.
- **Relação com a separação:** neutro.

### [SEC-003] Webhook sem validação de assinatura/origem

- **Categoria:** SEC · **Severidade:** P2 · **Área:** 12
- **Local:** `src/app/api/webhooks/[provider]/route.ts:16-37`
- **Evidência/Problema:** aceita qualquer corpo, só valida o nome do provider, loga e responde ok. Sem HMAC/token/origem. Inócuo hoje (mock, sem processamento); vira vetor quando o adapter real entrar.
- **Correção:** validar assinatura por provider antes de processar (pré-requisito de go-live da integração).
- **Confiança:** ALTA · **Separação:** neutro.

### [SEC-004] Read-queries não chamam `assertCan` (override de permissão ignorado na leitura)

- **Categoria:** SEC · **Severidade:** P2 · **Área:** 5/6/7/8/9
- **Local:** wrappers de leitura (`getPatients`/`getAppointments`/`getProcedures*`/`getPipelineData`/`getClinicDashboard`/`listInsights`/`getGoalsWithProgress`) — nenhuma chama `assertCan`. Mutações chamam.
- **Evidência:** `permissions.ts:71` lê override `UserPermission`; só a escrita gateia. `[NÃO VERIFICADO]` se a página gateia leitura.
- **Problema:** revogar leitura de um módulo via `UserPermission` não bloqueia a query → RBAC de leitura decorativo.
- **Correção:** `assertCan(ctx, modulo, 'read')` nas wrappers (junto do SEC-001).
- **Confiança:** MÉDIA · **Separação:** facilita.

### [BUG-001] Export engole erro e não valida datas

- **Categoria:** BUG · **Severidade:** P3 · **Área:** 10
- **Local:** `src/app/api/export/[clientId]/[resource]/route.ts:282` (`} catch {`) e `:89-90` (`new Date(from)`).
- **Problema:** `catch {}` mascara causa (ForbiddenError vira 500 em vez de 403); datas sem validar → `Invalid Date` silencioso.
- **Correção:** diferenciar status code + validar datas. **Confiança:** ALTA · **Separação:** neutro.

### [SEC-005] PII (e-mails) em log do job de relatórios

- **Categoria:** SEC (LGPD) · **Severidade:** P3 · **Área:** 9/10
- **Local:** `src/server/jobs/reports-job.ts:92` — `logger.info(..., { clientId, to })`, `to` = e-mails.
- **Correção:** logar `recipients: to.length`. **Confiança:** ALTA · **Separação:** neutro.

## Resumos de sessão

### SA1 (2026-05-22) — verificação pós-reforma + caça ao compartilhado

- **Áreas tocadas:** acoplamento transversal Clínica×Admin (telas 5-9), Tenant/Auth (leitura de
  `assertClientAccess`), Layout (cascas burras confirmadas OK).
- **Achados:** 4 — CPLX-001 (P2), SEC-001 (P2), SEC-002 (P2), PERF-001 (P2). **Zero P0/P1.**
- **Veredito da separação:** "Divisão Total" é, na prática, **divisão parcial**. As 4 áreas
  isoladas pela reforma (atividades/calendário/notificações/settings/layout) estão bem feitas e
  com testes de isolamento (21 verdes). O núcleo de negócio (overview/insights/goals/crm/
  financeiro/pacientes/procedimentos/agendamentos) permanece código único compartilhado, keyed
  por `clientId`/`role` — sem leak provado, mas contradiz o DoD §7.
- **Sem P0/P1:** o isolamento da clínica HOJE funciona porque toda tela da clínica deriva
  `clientId` da sessão. Os achados SEC são defesa-em-profundidade / IDOR latente.
- **Próxima área sugerida:** completar sweep dos jobs de cron (snapshots/reports/recurring-costs)
  e auditar Relatórios/Export (área 10 — vetor clássico de IDOR) e Integrações/webhooks (área 12).
