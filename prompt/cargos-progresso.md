# Cargos configuráveis + titularidade da clínica + metas por usuário/cargo

> Ledger de implementação multi-sessão. Fonte da verdade entre sessões.
> Convenção: igual a `reforma-progresso.md` / `fase11-progresso.md`.
> **Ao retomar:** ler este arquivo inteiro + memória `clinic-roles-feature`.

## Contexto / pedido do usuário

Dono da clínica precisa criar **cargos (roles) configuráveis** com permissões por aba,
e **metas/atividades separadas por usuário/cargo**. Pedido explícito: executar em
**2 etapas separadas e interligadas** — Etapa 1 (roles) primeiro, Etapa 2 (metas) depois.

Exemplo do usuário: cargo "Atendente de caixa" só acessa Pipeline, Agenda, Atividades
(pessoais), Metas (pessoais). Dono cria o cargo na config, dá nome, e marca checkboxes
de permissão agrupados por aba do sistema.

## Decisões de arquitetura (TODAS confirmadas com o usuário)

| #   | Decisão                           | Escolha                                                                                                                                                                                                                                                                    |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Modelo de role                    | **Nova tabela `ClinicRole`**. User aponta p/ um cargo. Enum `UserRole` continua só p/ separar domínio admin×clínica.                                                                                                                                                       |
| D2  | Gate de aba bloqueada             | **Some da sidebar E bloqueia a rota** (redirect server-side). Não é só obscuridade.                                                                                                                                                                                        |
| D3  | Visão pessoal (atividades/metas)  | **Permissão `viewAll` por módulo**: quem tem vê de todos; senão só os seus. Titular sempre vê tudo.                                                                                                                                                                        |
| D4  | Delegar a outros                  | **Permissão `assignToOthers` por módulo** (checkbox extra nas abas relevantes: goals, activities). Criar item no nome de outro user/cargo.                                                                                                                                 |
| D5  | Alvo de meta/tarefa               | **Usuário OU cargo**; modo **individual** (cada um sua cota) ou **compartilhada** (soma do grupo). 4 combinações.                                                                                                                                                          |
| D6  | Ordem                             | **Etapa 1 (roles) → commit/verify → Etapa 2 (metas)**.                                                                                                                                                                                                                     |
| D7  | Transferência de coroa da clínica | **Incluir na Etapa 1** (dialog análogo ao admin `transferOwnershipAction`).                                                                                                                                                                                                |
| D8  | Presets de cargo                  | **Não.** Só o cargo "Titular" (implícito/auto). Resto o dono cria do zero.                                                                                                                                                                                                 |
| D9  | Titular da clínica                | Espelha `Organization.ownerId`. `Client.ownerId`. Primeiro usuário interno (criador) recebe coroa, único com acesso total. Campos sensíveis (nome/email/senha/cidade/telefone/estado) só o titular. Seed: `lucorreiaesteticacwb@gmail.com` = titular da lucorreiaestetica. |

## Mecânica existente a ESTENDER (não quebrar)

- `src/server/auth/permissions.ts` — `ROLE_DEFAULTS[role]` + override por usuário em
  `UserPermission(userId,module,canRead/Write/Delete)`. `can()` async / `canSync()` sync.
  ADMIN sempre `*`. **Ponto único de decisão de permissão.**
- `src/server/auth/assert-can.ts` — `assertCan(ctx, module, action)` gate no início das server actions.
- `src/server/auth/config.ts` — JWT/session carregam role/orgId/clientId; re-sync do DB a cada 10 min (jwt callback ~L87). É onde plugar `clinicRoleId` + `isClinicOwner`.
- `src/server/auth/clinic-context.ts` — `getClinicContext()` fixa clientId p/ RLS (`enterClientScope`).
- Módulos válidos: `clients,crm,financial,insights,goals,patients,appointments,procedures,activities,reports,staff,settings`.
- Titularidade admin de referência: `Organization.ownerId`, `isOrganizationOwner()` (organization-queries.ts:9),
  coroa em `topbar-shell.tsx:85`, `transferOwnershipAction()` (staff-actions.ts:240),
  `transfer-ownership-dialog.tsx`, atribuição auto do 1º owner em `auth-actions.ts:76`.
- Matriz de permissão admin (modelo de UI): `src/modules/staff/permission-matrix.tsx`, `permission-modules.ts`.
- Aceite de convite: `acceptInviteAction()` em `src/server/actions/auth-actions.ts`.
- Convite de usuário da clínica: `client-actions.ts:142` (inviteClientOwnerAction), `client-users.tsx`, `invite-clinic-user-dialog.tsx`.

## Modelo de dados novo (Etapa 1)

```prisma
// Client ganha:
ownerId String? @unique
owner   User?   @relation("ClientOwner", fields: [ownerId], references: [id])

// User ganha:
clinicRoleId String?
clinicRole   ClinicRole? @relation("UserClinicRole", fields: [clinicRoleId], references: [id])
ownedClient  Client?     @relation("ClientOwner")  // inverso

model ClinicRole {
  id             String   @id @default(cuid())
  organizationId String
  clientId       String
  client         Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  name           String
  permissions    Json     // ver formato abaixo
  canManageRoles Boolean  @default(false)
  isSystem       Boolean  @default(false)  // cargo Titular: não editável/deletável
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  users          User[]   @relation("UserClinicRole")
  @@unique([clientId, name])
  @@index([clientId])
}
```

Formato `permissions` (JSON, uma entrada por aba):

```jsonc
{
  "financial": { "access": false }, // aba bloqueada → sub-checkboxes nulos/recolhidos
  "crm": { "access": true, "read": true, "write": true, "delete": false },
  "goals": {
    "access": true,
    "read": true,
    "write": true,
    "delete": false,
    "assignToOthers": true,
    "viewAll": false,
  },
  "activities": {
    "access": true,
    "read": true,
    "write": true,
    "delete": false,
    "assignToOthers": false,
    "viewAll": false,
  },
}
```

`access:false` ⇒ nega tudo naquela aba + some da sidebar + rota redireciona.
`assignToOthers`/`viewAll` só nas abas relevantes (goals, activities) — D3/D4.

## Resolução de permissão (nova ordem em `can()`)

1. ADMIN → `*` true (inalterado).
2. Titular da clínica (`user.id === client.ownerId`) → tudo true (coroa).
3. Tem `clinicRoleId` → lê `ClinicRole.permissions[module]`; `access:false` nega tudo; senão flag da ação.
4. Sem cargo → fallback atual (`ROLE_DEFAULTS` + `UserPermission`). **Existentes não mudam.**

Estender tipo `Action`: `read|write|delete|assignToOthers|viewAll`.

---

## ETAPA 1 — Cargos + titularidade (✅ COMPLETA — A+B+C commitados)

### Tarefas

- [ ] **1.1 Schema** — `Client.ownerId`, `User.clinicRoleId`, model `ClinicRole`. Migration. Aplicar no `.env.test` (`npm run migrate:test`). Prod = usuário.
- [ ] **1.2 permissions.ts** — estender `can()`/`canSync()` c/ ordem acima + ações `assignToOthers`/`viewAll`. `assertCan` aceita as novas ações.
- [ ] **1.3 Claims** — `config.ts` jwt/session + login carregam `clinicRoleId`, `isClinicOwner`. `clinic-context.ts` expõe `clinicRoleId`+`isOwner`. Tipos em `next-auth.d.ts`.
- [ ] **1.4 Gate de aba** — helper `assertTabAccess(ctx, module)` (redirect se `access:false`). Chamar no `(clinic)/layout.tsx` (map pathname→módulo) ou por page. `clinic-sidebar.tsx` recebe abas permitidas e filtra.
- [ ] **1.5 Titularidade** — atribuição auto do 1º owner da clínica em `acceptInviteAction` (espelha auth-actions.ts:76). Coroa na UI de usuários. Travar campos sensíveis da clínica só p/ titular (server action). Dialog de transferir titularidade (D7).
- [ ] **1.6 Repo+actions de cargo** — `clinic-role-repository.ts` (CRUD), `clinic-role-actions.ts` (create/update/delete/assign, gate canManageRoles ou titular).
- [ ] **1.7 UI config** — card "Cargos e permissões" em `/configuracoes` (titular ou canManageRoles). Lista + dialog c/ matriz por aba: checkbox-mestre "bloquear acesso" recolhe sub-checkboxes; senão read/write/delete (+assignToOthers/viewAll). Checkbox "pode criar cargos". Select de cargo na lista de usuários.
- [ ] **1.8 Seed** — `lucorreiaesteticacwb@gmail.com` titular da lucorreiaestetica. (Sem presets — D8.)
- [ ] **1.9 Verify** — tsc + Playwright no .env.test: titular vê tudo+card cargos; cria "Atendente de caixa"; atribui a staff; staff só vê abas liberadas; rota bloqueada redireciona.
- [ ] **1.10 Commit** — commits separados por área lógica.

### Arquivos (estimativa)

`prisma/schema.prisma`(+migration), `permissions.ts`, `assert-can.ts`, `config.ts`, `next-auth.d.ts`,
`clinic-context.ts`, `clinic-sidebar.tsx`, `(clinic)/layout.tsx`(+helper gate), `configuracoes/page.tsx`,
novos componentes de cargo (matriz, dialog, lista), `client-repository.ts`, `auth-actions.ts`,
novos `clinic-role-repository.ts`/`clinic-role-actions.ts`, `client-users.tsx`, seed. ~15-18 arquivos.

### Execução: POR PARTES COMMITÁVEIS (confirmado)

- **Bloco A**: schema+migration+permissions+claims (fundação) → verify login/abas não quebram → commit.
- **Bloco B**: gate de aba + titularidade + coroa + transfer → verify → commit.
- **Bloco C**: UI de cargos (config) → verify → commit.

### Log de progresso

- 2026-05-24: plano aprovado, ledger criado, decisões D1-D9 fechadas.
- 2026-05-24: **Bloco A DONE** (1.1+1.2+1.3). Schema (Client.ownerId, User.clinicRoleId, model ClinicRole) + migration `20260524120000_clinic_roles_ownership` (com backfill de ownerId e RLS policy p/ ClinicRole) aplicada no .env.test. `permissions.ts`: `can()` agora resolve coroa→cargo→fallback; novo `clinic-permissions.ts` (tipos + clinicRoleCan/clinicRoleHasTabAccess/parse). `assert-can` aceita ClinicPermAction (read|write|delete|assignToOthers|viewAll). Claims: clinicRoleId no JWT/session/login/re-sync + next-auth.d.ts. `TenantContext.clinicRoleId`. `ClinicContext` ganhou `clinicRoleId`+`isOwner` (isOwner lido do DB por request, não do JWT). Jobs (reports/snapshots) e teste de isolamento atualizados p/ novo shape. tsc OK. Verify: owner-a (agora titular Alpha via backfill) loga, navega 5 abas + /configuracoes, screenshot OK — login/permissões intactos. **Decisão impl:** isClinicOwner NÃO vai no JWT (evita stale pós-transferência); calculado em getClinicContext via query. canSync não enxerga cargo (sem DB) — não usar como gate p/ roles de clínica.
- 2026-05-24: **Bloco B DONE** (gate funcional + titularidade backend). Novo `clinic-tabs.ts`: `TAB_MODULE` (href→módulo), `getVisibleTabs(ctx)`, `assertTabAccess`, `gateClinicTab(tab)`. ALWAYS_VISIBLE = overview/notificacoes/settings (todo user vê). Sidebar (`clinic-sidebar.tsx`) recebe `visibleHrefs` e filtra; layout `(clinic)/layout.tsx` calcula via getVisibleTabs + passa. Gate de rota: `await gateClinicTab('<tab>')` no topo das 8 pages gateáveis (crm/financial/patients/goals/appointments/insights/procedures/atividades). Titularidade auto da clínica no `acceptInviteAction` (1º CLIENT_OWNER vira coroa, updateMany ownerId:null). Campos sensíveis da clínica travados só p/ titular em `updateClinicSettingsAction` (checa Client.ownerId===userId, ForbiddenError). Nova action `clinic-owner-actions.ts` `transferClinicOwnershipAction` (só titular; alvo CLIENT_OWNER ativo; updateMany condicional anti-corrida; audit log). tsc OK. Verify: criou cargo restrito (crm+appointments+activities) + CLIENT_STAFF, logou → sidebar só mostra liberadas+ALWAYS_VISIBLE, /financial por URL redireciona /overview, /crm acessível. Screenshot confirmou.
  - **Pendente p/ Bloco C** (vive na UI de usuários): coroa visual (ícone Crown) na lista de usuários da clínica + dialog que chama transferClinicOwnershipAction.
- 2026-05-24: **Bloco C DONE → ETAPA 1 COMPLETA.** `clinic-role-repository.ts` (list/find/create/update/delete/assign + listClinicUsers com flag isOwner). `clinic-role-actions.ts` (create/update/delete/assign, gate `assertCanManageRoles` = titular OU cargo.canManageRoles; nome único por clínica; audit log). `src/modules/clinic-roles/`: `clinic-modules.ts` (catálogo de abas; só goals+activities têm assignToOthers/viewAll — D3/D4), `role-dialog.tsx` (matriz: master-checkbox "Bloquear acesso" recolhe sub-ações; coerência read↔write/delete/view/assign), `clinic-roles-manager.tsx` (lista de cargos editar/excluir + lista de usuários com Select de cargo + coroa Crown + botão "Tornar titular" → transferClinicOwnershipAction). `/configuracoes` server: calcula canManageRoles (titular ou cargo), lista cargos+usuários, renderiza manager; card "Clínica" agora usa ctx.isOwner (titular real, não qualquer CLIENT_OWNER). tsc OK. Verify: titular vê card+coroa("Acesso total"), cria cargo via dialog (bloqueia Financeiro), cargo aparece+persiste. Screenshot confirmou. **Gotcha de teste:** getByRole('dialog') colide com banner de cookies; usar name. **Cold-start flaky:** webServer 180s timeout às vezes; pré-aquecer /login com Invoke-WebRequest antes do Playwright resolve.

**STATUS ETAPA 1: A+B+C commitados. Falta só Etapa 2 (metas por usuário/cargo).**

---

## ETAPA 2 — Metas por usuário/cargo (✅ COMPLETA — só Metas; atividades adiadas)

### Contexto

Hoje `Goal(clientId)` sem userId/role (ver memória/exploração). Goal model: `prisma/schema.prisma:604-638`,
repo `goal-repository.ts`, queries `goal-queries.ts`, actions `goal-actions.ts`, UI `src/modules/goals/`,
dashboard usa `goalsProgress` (dashboard-queries.ts ~357). Progresso calculado em `getCurrentGoalValue()`.

### Decisões adicionais (confirmadas no início da Etapa 2)

- **D10** Cálculo individual = **autor do registro**: REVENUE→Revenue.createdById, LEADS→Lead.assignedToId, APPOINTMENTS→Appointment.createdById, NEW_PATIENTS→Patient.createdById. (Derivadas CONVERSION/NO_SHOW/AVERAGE_TICKET continuam 0.)
- **D11** Escopo da Etapa 2 = **só Metas** (atividades pessoais ficam p/ depois; viewAll/assignToOthers já existem no cargo).
- **D12** Meta de CARGO + INDIVIDUAL = **uma linha por membro, cota igual** (expande na query).

### Tarefas

- [x] **2.1 Schema Goal** — enums GoalScopeType(CLINIC/USER/ROLE) + GoalMode(INDIVIDUAL/SHARED); campos scopeType(def CLINIC)/mode(def SHARED)/assigneeUserId/assigneeRoleId (FK CASCADE). Migration `20260524180000_goal_scope` aplicada no .env.test. Metas existentes → CLINIC+SHARED.
- [x] **2.2 Cálculo** — `getCurrentGoalValue(ctx,clientId,goal,assigneeUserId?)`: com assignee filtra pelo autor (D10).
- [x] **2.3 Queries+visibilidade** — `goal-queries.ts` reescrito: GoalWithProgress ganha scopeLabel+memberUserId. Visibilidade: admin/unscoped vê tudo; titular ou goals.viewAll vê tudo; senão só CLINIC+atribuídas a si+ao cargo. Meta ROLE INDIVIDUAL expande 1 linha/membro (progresso por autor); ROLE SHARED = 1 linha agregada; USER conforme modo.
- [x] **2.4 Actions** — createGoalAction aceita escopo; normaliza alvo; gate `assignToOthers` se delega a outro/cargo (meta p/ si mesmo basta goals:write); valida alvo pertence à clínica.
- [x] **2.5 UI** — GoalView+scope; create-goal-dialog ganha bloco de escopo (alvo user/cargo + modo) só se canAssign; goal-card mostra badge scopeLabel·modo; goals-page passa users/roles/canAssign + key composta (id:memberUserId); clinic+admin pages carregam alvos e mapeiam campos (admin usa unscoped).
- [x] **2.6 Verify+commit** — tsc OK. Verify: titular cria meta REVENUE atribuída a usuário (individual), card mostra "Dono Alpha · individual", DB scopeType=USER/mode=INDIVIDUAL. Screenshot confirmou. Progresso 0 correto (mede por autor; sem receitas do usuário no seed).

### Não feito (escopo deliberado)

- ~~Atividades pessoais (D11 adiou)~~ — **FECHADO COMO OBSOLETO (2026-06-10, decisão do
  usuário):** o design atual do produto orienta as atividades 100% ao CLIENTE/paciente
  (atividade de clínica exige leadId/patientId), não a "minhas tarefas pessoais" — o
  conceito de atividade pessoal não existe mais no produto. `viewAll`/`assignToOthers`
  no cargo cobrem a visibilidade. Não reabrir sem redesenho de produto.
- Dashboard `goalsProgress` (dashboard-queries.ts ~357) agrega todas as metas da clínica —
  não expande por escopo; aceitável (visão geral). Editar meta não expõe escopo no dialog
  de edição (só criação).

### Log de progresso

- 2026-05-24: **ETAPA 2 DONE** (só Metas). 11 arquivos. Ver tarefas acima.

---

## ETAPA 3 — Fechar lacunas + visibilidade de dashboard por cargo (✅ COMPLETA)

Pedido do usuário: fechar as 3 lacunas deixadas nas Etapas 1-2, e AMPLIAR a #2 —
no cargo, poder marcar a visibilidade de cada item do dashboard (por seção,
seção editável item a item).

### Decisões (confirmadas)

- **D13** Editar meta: NÃO existia (card só excluía). Generalizou `create-goal-dialog`
  em create+edit (prop `initial`/`open`/`onOpenChange`); botão lápis no goal-card.
- **D14** Atividades (lacuna 3): `Activity` JÁ tem `assignedToId`/`createdById` → SEM migration.
  Cargo já tinha `viewAll`/`assignToOthers` p/ activities. Faltava query+actions+UI respeitarem.
- **D15** Visibilidade de dashboard: armazenar na chave reservada `dashboard` DENTRO do
  `ClinicRole.permissions` JSON (sem coluna/tabela nova — questionado pelo usuário, decisão dele).
- **D16** Granularidade: SEÇÃO com itens editáveis (master + filhos), padrão igual à matriz de abas.
- **D17** Default OPT-IN: cargo sem chave `dashboard` não vê seções. Titular + admin SEMPRE veem tudo.
- **D18** Itens ocultos somem; card de Metas no dashboard mostra só metas do viewer (titular/viewAll = todas).

### Catálogo dashboard (5 seções) — `src/modules/clinic-roles/dashboard-catalog.ts`

commercialKpis (leads/appointments/attendance/noShow/conversion/timeToFirstContact),
financialKpis (revenue/costs/netProfit/averageTicket/grossMargin/netMargin/roi/cac/lostRevenue/healthScore),
revenueCharts (revenueGenerated/revenueReceived/funnel), distributions (revenueByProcedure/leadsBySource),
tracking (insights/goals). Ao add KPI/gráfico no clinic-dashboard, espelhar aqui + no gate.

### Feito

- **Lacuna 1** (editar meta): `create-goal-dialog.tsx` generalizado (create+edit, reidrata via useEffect);
  `goal-card.tsx` ganha lápis + dialog edit, recebe users/roles/canAssign; `GoalView` + as 2 goals pages
  (clinic+admin) propagam `assigneeUserId`/`assigneeRoleId`. `updateGoalAction` já existia.
- **Lacuna 3** (atividades pessoais): `activity-queries.ts` força `assignedToId=ctx.userId` quando
  viewer não é titular e sem `activities:viewAll`; expõe `canViewAll`/`canAssignOthers` + reduz members.
  `activity-actions.ts` helper `canAssignOthers(ctx)`; create/update ignoram alvo-outro/'all' sem permissão
  (defesa server). `clinic-activities-page.tsx` + page passam `canAssignOthers` → controla fan-out/seletor.
- **Lacuna 2** (dashboard por cargo): `clinic-permissions.ts` +tipos `DashboardPermissions` +helpers
  (`parseDashboardPermissions`/`dashboardSectionVisible`/`dashboardItemVisible`, chave `DASHBOARD_PERM_KEY`).
  `role-dialog.tsx` bloco "Visibilidade do dashboard" (master seção + itens filhos), serializa em `permissions.dashboard`.
  `dashboard-visibility.ts` (NOVO server): `resolveDashboardVisibility(ctx)` (titular/sem-cargo=tudo, senão lê cargo),
  `allDashboardVisible()`. `clinic-dashboard.tsx` recebe `visibility?` + helper `vis(section,item?)` gateia cada KPI/card/seção
  (seção sem itens visíveis some). `(clinic)/overview/page.tsx` resolve via getClinicContext e passa; admin overview = default (tudo).
  Lacuna 2d: `dashboard-queries.ts` `filterGoalsForViewer(ctx,clientId,goals)` filtra goalsProgress (titular/viewAll=todas; senão CLINIC+atribuídas a si/cargo).

### Não aplicado / pendências

- SEM migration nesta etapa (tudo em JSON existente + colunas já existentes).
- NÃO commitado ainda nesta sessão (aguarda usuário). tsc OK, lint OK (só 5 warnings pré-existentes alheios).
- Falta verify manual/Playwright no .env.test (criar cargo com dashboard restrito, logar como staff, conferir gate).
- `quickAdd` da clínica pode mandar assignee 'all' por URL; a action força self sem permissão (defesa server cobre UX).

### Log

- 2026-05-24: **ETAPA 3 DONE** (lacunas 1+2+3). ~14 arquivos, 2 novos (dashboard-catalog.ts, dashboard-visibility.ts). Sem migration.

---

## Ambiente / cuidados

- `.env` = **produção**. Migrations: usuário aplica em prod; eu aplico no `.env.test` (Neon) via `npm run migrate:test`.
- DB de teste já está em dia até migration `pipeline_stage_kind` (aplicada nesta sessão).
- Verify usa seed-e2e (owner-a@senno.dev/owner123 → /overview). Pre-commit roda eslint+prettier (lint-staged).
- Branch: trabalhar conforme o usuário pedir (sessão anterior commitou direto na main a pedido dele).
