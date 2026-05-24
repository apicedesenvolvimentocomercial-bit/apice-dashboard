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

## ETAPA 1 — Cargos + titularidade (EM ANDAMENTO)

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
- PENDENTE Bloco B: gate de aba (sidebar+rota), titularidade (auto 1º owner no accept-invite, coroa UI, travar campos sensíveis, transfer dialog).
- PENDENTE Bloco C: UI de cargos na config.

---

## ETAPA 2 — Metas/atividades por usuário/cargo (NÃO INICIADA — só após Etapa 1 commitada)

### Contexto

Hoje `Goal(clientId)` sem userId/role (ver memória/exploração). Goal model: `prisma/schema.prisma:604-638`,
repo `goal-repository.ts`, queries `goal-queries.ts`, actions `goal-actions.ts`, UI `src/modules/goals/`,
dashboard usa `goalsProgress` (dashboard-queries.ts ~357). Progresso calculado em `getCurrentGoalValue()`.

### Tarefas (esboço — detalhar ao iniciar)

- [ ] **2.1 Schema Goal** — escopo: alvo (userId? OU clinicRoleId?) + modo (`INDIVIDUAL|SHARED`). Nullable p/ metas existentes virarem coletivas. Mesma ideia p/ Activity (pessoal).
- [ ] **2.2 Cálculo** — meta individual atribuída a cargo = cota por pessoa; compartilhada = soma do grupo. `getCurrentGoalValue()` filtra por user/cargo conforme escopo.
- [ ] **2.3 Visibilidade** — usa `viewAll`(D3): titular/quem-tem vê todas; staff vê suas (atribuídas a ele OU ao cargo dele OU compartilhadas do grupo). Criação respeita `assignToOthers`(D4).
- [ ] **2.4 UI** — dialog de meta: alvo (usuário/cargo) + modo (individual/compartilhada). Filtro "minhas / todas". Mesmo p/ atividades.
- [ ] **2.5 Verify + commit.**

### Log de progresso

- _(vazio)_

---

## Ambiente / cuidados

- `.env` = **produção**. Migrations: usuário aplica em prod; eu aplico no `.env.test` (Neon) via `npm run migrate:test`.
- DB de teste já está em dia até migration `pipeline_stage_kind` (aplicada nesta sessão).
- Verify usa seed-e2e (owner-a@apice.dev/owner123 → /overview). Pre-commit roda eslint+prettier (lint-staged).
- Branch: trabalhar conforme o usuário pedir (sessão anterior commitou direto na main a pedido dele).
