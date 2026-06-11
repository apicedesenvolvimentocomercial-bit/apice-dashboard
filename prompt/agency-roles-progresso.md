# Cargos de agência (AgencyRole) + hierarquia linear + deny-by-default

Ledger desta feature. Espelha o sistema de cargos da clínica (`ClinicRole`) no
domínio admin/agência, introduz hierarquia linear de cargos, e remove o sistema
legado `UserPermission`. Pré-MVP: prod só tem seed → migration destrutiva sem
backfill é aceitável.

## Decisões (alinhadas com o usuário)

- **D1 — Espelhar, não compartilhar (Isolamento total).** `AgencyRole` é tabela /
  repositório / actions / UI **separados** de `ClinicRole`, igual à Divisão Total
  admin×clínica. Só helpers de permissão **neutros** (`roleCan`, tipos) e
  primitivos de UI cruzam a fronteira. Zero acoplamento de feature.
- **D2 — Remover `UserPermission`.** Era o override granular por-usuário do STAFF
  da agência (3 booleans). Substituído por cargos reutilizáveis `AgencyRole`.
- **D3 — Deny-by-default real (item 5).** `ROLE_DEFAULTS` deixa de conceder
  qualquer permissão (vira tudo-false). Usuário não-titular **sem cargo** = zero
  acesso; ao cair em qualquer rota → redirect `/login`. O role passa a ser só
  discriminador de domínio (ADMIN/STAFF = agência; CLIENT_OWNER/CLIENT_STAFF =
  clínica). **Toda** permissão vem do cargo ou da coroa.
  - ADMIN e titulares (Organization.ownerId / Client.ownerId) **nunca** caem
    nisso — a coroa dá acesso total antes de consultar cargo.
  - Remove os escapes atuais de `clinic-tabs.ts` ("sem cargo → todas",
    "cargo sumiu → não tranca"). Sem cargo agora tranca.
- **D4 — Admin não-titular (item 1a).** Titular cria outro `ADMIN` (role) sem
  titularidade (`Organization.ownerId` continua sendo só ele). Regra única:
  **ninguém altera o titular exceto ele mesmo.** Novo admin não rebaixa o
  titular; o titular rebaixa qualquer um.
- **D5 — Hierarquia LINEAR (item 1c).** Cada cargo tem um `level` inteiro dentro
  do seu domínio. Só **linear** — sem árvore / sem `parentRoleId` / sem doc de
  evolução futura (decisão explícita do usuário). Regras de quem-mexe-em-quem:
  - Só o **titular** ordena/reordena cargos por default.
  - A habilidade de gerenciar cargos é um flag de cargo (`canManageRoles`, já
    existe). Quem a tem **não pode**: (a) atribuir a alguém um cargo de `level`
    ≥ ao seu próprio; (b) alterar o cargo de um usuário cujo cargo tenha `level`
    ≥ ao seu. Comparação de inteiros — gate simples e testável.
  - Ao criar um cargo, quem tem `canManageRoles` escolhe a posição na
    hierarquia, **nunca acima do próprio `level`**.
- **D6 — Sem cargo "Titular" no AgencyRole.** A coroa da agência já é
  `Organization.ownerId` + role ADMIN (ignora cargo). `AgencyRole` só granula o
  STAFF. (Difere do `ClinicRole`, que tem o cargo de sistema "Titular".)

## Modelo de hierarquia linear (detalhe)

`level: Int` por cargo, escopado por domínio (único por `organizationId` no
AgencyRole / por `clientId` no ClinicRole). Menor `level` = mais alto na
hierarquia (0 = topo logo abaixo da coroa). A coroa/ADMIN é tratada como
`level = -∞` (acima de tudo) na camada de código, não no banco.

Gate de atribuição (`assignRole`):

- ator é coroa/ADMIN-titular → pode tudo.
- senão, ator precisa de `canManageRoles` E `actorLevel < targetRoleLevel` E
  (se o alvo já tem cargo) `actorLevel < currentTargetLevel`.

## Plano de execução (ordem)

1. **Schema** — `AgencyRole` (espelho de ClinicRole + `level Int`), `User.agencyRoleId`
   (+ relation, onDelete SetNull), `level Int` em `ClinicRole`, **drop** `UserPermission`
   (model + `User.permissions`). `@@unique([organizationId, name])`,
   `@@unique([organizationId, level])` / idem clínica por clientId.
2. **Permissions core** — extrair helpers neutros (`role-permissions.ts`: `roleCan`,
   `RolePermissions`, `roleHasTabAccess`...) reexportados pelos nomes antigos de
   `clinic-permissions.ts`. `permissions.ts` `can()`: ordem nova, branch de agência
   (lê `agencyRoleId`), **deny-by-default** (remove UserPermission, ROLE_DEFAULTS
   tudo-false). Helper de hierarquia `canActOnRoleLevel(actor, targetLevel)`.
3. **AgencyRole repo + actions** (isolado): CRUD + assign + gate de hierarquia +
   `assertCanManageAgencyRoles`. AuditLog `entityType: 'AgencyRole'`.
4. **Hierarquia no ClinicRole** — adicionar `level` + gate de hierarquia no assign
   da clínica (espelhar a mesma regra; titular ordena).
5. **UI** — `modules/agency-roles/` (espelho isolado de `clinic-roles/`): card de
   cargos na equipe/config admin, dialog de cargo com nível. **Remover** UI legada:
   `permission-matrix.tsx`, dialog de matriz em `staff-list.tsx`,
   `updateStaffPermissionsAction`, `upsertUserPermissions`, selects de UserPermission.
6. **Gate de rota deny-by-default** — agência (`(admin)/layout.tsx` + pages) e
   clínica (`clinic-tabs.ts`): sem cargo e sem coroa → redirect `/login`. Repensar
   `ALWAYS_VISIBLE` (sem cargo não vê nem overview).
7. **Migration destrutiva** + **seeds** (`seed.ts`, `seed-e2e.ts`): remover
   UserPermission; criar AgencyRole(s) de exemplo e atribuir ao STAFF do seed
   (senão o STAFF do seed fica trancado por D3).
8. **Verificação** — validate + generate + type-check + test; ajustar testes.

## Estado

- [x] 1 Schema — AgencyRole, User.agencyRoleId, level nos dois cargos, drop UserPermission.
- [x] 2 Permissions core — `role-permissions.ts` neutro (`roleCan`, `canActOnRoleLevel`);
      `clinic-permissions.ts` virou reexport; `permissions.ts` deny-by-default + branch agência.
- [x] 3 AgencyRole repo+actions — `agency-role-repository.ts` + `agency-role-actions.ts`
      com gate de hierarquia (`assertLevelBelow`). `getAdminContext` enriquecido (isOwner+agencyRoleId).
- [x] 4 Hierarquia no ClinicRole — `level` no repo/actions + gate de hierarquia espelhado.
- [x] 5 UI + remoção do legado — `modules/agency-roles/` (manager + role-dialog + agency-modules);
      campo `level` no role-dialog da clínica; removidos permission-matrix/permission-modules +
      `updateStaffPermissionsAction` + `upsertUserPermissions`; `/staff` monta o manager.
- [x] 6 Gate de rota deny-by-default — `clinic-tabs.ts` sem escapes; `agency-tabs.ts` novo;
      layouts admin/clínica expulsam p/ /login sem cargo/coroa; sidebars filtram por cargo.
- [x] 7 Migration + seeds — migration destrutiva (drop UserPermission, AgencyRole, level+backfill
      sequencial no ClinicRole); seed/seed-e2e criam AgencyRole "Gerente" p/ STAFF e setam
      Client.ownerId dos owners (senão deny-by-default os tranca).
- [x] 8 Verificação — type-check limpo, 131 testes verdes, lint 0 erros, prisma validate ok.

## Pendências RESOLVIDAS (rodada 2)

- **Gate fino por-aba no ADMIN** ✅ — `gateAgencyTab(tab)` (espelho de `gateClinicTab`) no topo
  de cada page admin gateável (clients, pipeline, activities, calendar, staff). Acesso direto por
  URL a aba não-liberada agora redireciona p/ /dashboard.
- **Modelo unificado de cargo (só permissão)** ✅ — `UserRole` permanece interno como
  discriminador de domínio, mas a UI nunca mostra "STAFF" como cargo: a coluna de cargo mostra o
  AgencyRole ("Acesso total" p/ ADMIN, nome do cargo, ou "Sem cargo"). Botão "Tornar ADMIN/
  Rebaixar" virou "Conceder/Remover acesso total". Convite reescrito.
- **ADMIN não mexe em ADMIN** ✅ — conceder/remover acesso total (tocar em ADMIN) só o TITULAR
  (`Organization.ownerId`); `updateStaffRoleAction` reforça no servidor + UI desabilita p/ não-titular.
- **Mesmo nível não rebaixa** ✅ — `canActOnRoleLevel` é estrito (`actor < target`), então cargos
  de mesmo nível já não se gerenciam.

## Pendências ainda abertas

- Nenhuma. ~~Migration aplicada pelo usuário em prod~~ — **RESOLVIDA por mecanismo:**
  migrations agora aplicam automaticamente no build da Vercel
  (`scripts/migrate-if-prod.mjs`, só `VERCEL_ENV=production`) — ver CLAUDE.md
  "Ambiente & comandos".
