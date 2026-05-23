# Reforma Divisão Total — Progresso

## Decisões travadas

- Arquitetura: mesmo repo, domínios isolados.
- Escopo de dado: **`clientId` nullable** (deriva domínio: `clientId != null ⇒ clínica`). Decidido pelo usuário S1.
- Feature flag: **A DECIDIR** (`CLINIC_FEATURES_ENABLED`?) — decisão de rollout (Fase 8), não bloqueia limpeza. Default §6: liberar por fase validada, sem flag.
- Feriados na clínica: **`ClinicHoliday` por clínica** (decidido de fato na Fase 4/S2; formalizado S3).
- **Fase 7 — casa do shared:** `components/shared/*` p/ display burro + arquivo de tipos shared. NÃO `components/ui` (só shadcn). Move o que a clínica importa de `modules/*` (notification-icon, color-picker, calendar-inner, folder-colors, activity types/labels, profile/password forms) e tipos cross-domain de `server/queries/calendar-queries`.
- **Fase 7 — settings:** SPLIT em `(admin)/settings` + `(clinic)/settings`; forms comuns (perfil/senha) viram shared.
- **Rename `(client)`→`(clinic)` + namespacing:** **fase isolada própria PÓS-Fase 7** (não fazer dentro da 7). Mantém slugs PT atuais por ora.

## Status por fase

| Fase | Título                | Status    | Sessão          | Notas                                                                                                                                                                                                                      |
| ---- | --------------------- | --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Contextos de domínio  | CONCLUÍDA | S1 (2026-05-20) | Contextos criados; typecheck verde. Adoção distribuída p/ Fases 2-8.                                                                                                                                                       |
| 1    | Escopo de dados       | CONCLUÍDA | S1              | Migration+backfill APLICADOS pelo usuário. Schema/índices/FK em prod.                                                                                                                                                      |
| 2    | Notificações isoladas | CONCLUÍDA | S1              | Repo+actions+query+rota `(client)/notifications`+componente+nav. dispatch grava clientId. Falta cron split (Fase 8).                                                                                                       |
| 3    | Atividades isoladas   | CONCLUÍDA | S1              | P0 resolvido (clientId forçado). Repo+actions+query+rota+UI lean+nav. Fan-out/assignee só CLIENT\_\* mesma clínica.                                                                                                        |
| 4    | Calendário isolado    | CONCLUÍDA | S2              | FullCalendar rico embutido em `/appointments` (toggle "Agendamentos/Calendário" + slide). ClinicHoliday ligado. Sync atividade→calendário. `/agenda` lean removida.                                                        |
| 5    | Layout separado       | CONCLUÍDA | S3 (2026-05-21) | Sidebar/topbar split em `components/admin/*` + `components/clinic/*` sobre cascas burras `layout/{sidebar,topbar}-shell`. Zero branch de domínio. `(account)` monta casca por role.                                        |
| 6    | Rotas/nav clínica     | CONCLUÍDA | S3 (2026-05-21) | Nav clínica isolada no `ClinicSidebar`. assertCan read na query de atividades (writes já gateados). Revalidação já escopada (Fase 3/4).                                                                                    |
| 7    | Limpeza/dead code     | CONCLUÍDA | S3 (2026-05-21) | Display/tipos shared → `components/shared/*` + `src/shared/calendar-types`. Settings split: admin `/settings`, clínica `/configuracoes`. Branches CLIENT\_\* órfãos removidos do activity-actions admin. README do shared. |
| 8    | Hardening/testes      | CONCLUÍDA | S3 (2026-05-21) | Suíte isolamento 21 testes (3 repos clínica) verde. Cron notif roteia por domínio (link PT + clientId). Perf/logs revisados. Relatório `reforma-relatorio.md`.                                                             |

## Relatórios de fase

<!-- append-only, mais recente embaixo -->

### S1 (2026-05-20) — FASE 0 (fundação)

**Feito:**

- Criado `src/server/auth/admin-context.ts` (`AdminContext`/`getAdminContext`) e `src/server/auth/clinic-context.ts` (`ClinicContext`/`getClinicContext`), conforme §3.2. `ClinicContext.clientId` é `string` (não-nulo) — invariante de isolamento.
- `assertCan` (`src/server/auth/assert-can.ts`): assinatura `ctx: TenantContext` → `ctx: Pick<TenantContext,'userId'|'role'>`. Widening: todos os callers atuais (passam `TenantContext` completo) continuam válidos; agora `AdminContext` (sem `clientId`) também é aceito.

**Decisão técnica (justificativa):** adoção dos contextos NÃO foi feita em massa nas actions. Motivo: as actions de feature (patient/goal/appointment/...) são **compartilhadas hoje** entre admin e clínica — usam `assertClientAccess(ctx, clientId)` que libera ADMIN/STAFF p/ qualquer clínica da org, e revalidam rotas dos DOIS domínios. Trocar p/ `getClinicContext` quebraria o acesso admin. Mesmo nas actions admin-only (staff/pipeline), o `ctx` é repassado a `createAuditLog` e repositories tipados em `TenantContext`, então adotar `AdminContext` ripple-aria nas assinaturas desses repos — trabalho que pertence às Fases 2-8 (split por feature), não à fundação. Fundação entregue de forma aditiva e reversível.

**Pendente desta fase:** adoção dos contextos nas actions/repos — distribuída pelas Fases 2-8, junto do split de cada feature.

**Como testar:** `next` corrigido `^9.3.3`→`^16.2.6`, lockfile regenerado, `npm install` ok, `npx tsc --noEmit` **verde**. Fase 0 verificada.

### S1 (2026-05-20) — FASE 1 (escopo de dados) — CODE-SIDE

**Feito (schema + migration, NÃO aplicado):**

- `prisma/schema.prisma`: `CalendarEvent.clientId String?` + `@@index([clientId, startAt])`; `Notification.clientId String?` + `@@index([clientId, readAt])`; `Activity` ganhou `@@index([clientId, status, dueDate])`. Back-relations `Client.calendarEvents`/`Client.notifications`.
- `prisma/migrations/20260520000000_domain_scope/migration.sql`: ADITIVA — ADD COLUMN nullable + CREATE INDEX + FK ON DELETE SET NULL + backfill idempotente (deriva clientId de `User.clientId` do dono/destinatário; guard `IS NULL`).
- `npx prisma generate --no-engine`: client regenerado, schema válido, tipos novos disponíveis.

**NÃO FEITO (bloqueado — DB de produção):** aplicar migration + rodar backfill. `.env` aponta p/ prod (Accelerate/db.prisma.io, app vercel). Aplicar exige o usuário rodar `npx prisma migrate deploy` contra prod (ou um dev DB). **Pré-requisito p/ Fases 2-4 funcionarem em runtime.**

### S1 (2026-05-20) — FASES 2/3/4 — SPINE DE SEGURANÇA (backend)

Construído o núcleo de isolamento (§3.4): camada de dados de clínica tipada com `ClinicContext`, escopo `clientId` impossível de esquecer. Aditivo (não toca caminho admin atual). Typecheck verde.

- **Fase 3:** `src/domains/clinic/activities/activity-repository.ts` — `buildClinicWhere` injeta `clientId = ctx.clientId` INCONDICIONAL (**corrige P0 §1.2**); create/update/delete escopados; `resolveClinicAssignee` (só CLIENT*\* mesma clínica); `listClinicBroadcastTargets` (fan-out só CLIENT*\* mesma clínica).
- **Fase 4:** `src/domains/clinic/calendar/calendar-event-repository.ts` — leitura/escrita escopadas por `clientId`; create grava `clientId`; sync atividade↔evento herda `clientId` (nunca cruza domínio).
- **Fase 2:** `src/domains/clinic/notifications/notification-repository.ts` — list/markRead/delete/recipients escopados por `clientId` (+ `userId`); recipients = CLIENT_OWNER+CLIENT_STAFF mesma clínica. `notification-repository` compartilhado: `createNotification(s)` aceita `clientId` (aditivo).

**PENDENTE p/ fechar 2-4 (próximas sessões):** server actions de clínica (usando os repos acima + `getClinicContext`); rotas `(client)/notifications`,`/activities`,`/calendar` + componentes em `components/clinic`; threading de `clientId` no `dispatchNotification`/insights/goals jobs; split do cron de notificações por domínio; decisão feriados (Fase 4); testes de isolamento (Fase 8). NADA disso roda até a migration da Fase 1 ser aplicada.

### S1 (2026-05-20, cont.) — FASES 1/2/3/4 FECHADAS

- **Fase 1:** usuário aplicou a migration `20260520000000_domain_scope` (+backfill) em prod. Colunas/índices/FK ativos.
- **Fase 2 (Notificações):** `domains/clinic/notifications/{notification-actions,notification-queries}.ts`; `components/clinic/notifications/clinic-notifications-page.tsx`; rota `(client)/notifications/page.tsx`; nav. `dispatchNotification` agora grava `clientId` (DispatchTarget.clientId; getRecipientsForClient/Activity preenchem). Reuso de `modules/notifications/notification-icon` (display puro) — realocar p/ `components/ui` na Fase 7.
- **Fase 3 (Atividades):** `domains/clinic/activities/{activity-actions,activity-queries}.ts`; `components/clinic/activities/clinic-activities-page.tsx` (UI lean: abas+quick-add+status+delete); rota `(client)/activities`. **P0 resolvido**: clientId forçado no repo. Fan-out "Todos" e assignee só CLIENT\_\* mesma clínica. Reuso de constantes display de `modules/activities/types` (TYPE/STATUS/PRIORITY labels).
- **Fase 4 (Calendário):** `domains/clinic/calendar/{calendar-event-actions,calendar-queries}.ts`; `components/clinic/calendar/clinic-calendar-page.tsx` (UI lean: agenda por dia + criar/excluir); rota `(client)/calendar`. Sync atividade↔evento herda clientId. **UI lean** (não é o FullCalendar do admin — divisão total proíbe compartilhar). **Feriados: decisão pendente** — UI lean não mostra OrgHoliday.

**Verificação:** `npx tsc --noEmit` verde após cada fase; `eslint` limpo no código novo. Runtime NÃO testado (sem ambiente local; DB é prod).

**Correção (colisão de rota):** route groups `(admin)`/`(client)` NÃO namespaceiam URL no Next. `(client)/activities|calendar|notifications` colidiam com `(admin)/...` → erro "two parallel pages resolve to same path". Renomeado p/ slugs PT únicos: **`/atividades`, `/agenda`, `/notificacoes`** (admin mantém `/activities|/calendar|/notifications`). Ajustado nav, `revalidatePath`, link de notificação e `notificationsHref` no topbar `(client)`. Decisão de namespacing definitivo (prefixo por domínio?) fica p/ Fase 5.

### S2 — Fase 4 completa (calendário rico embutido)

- Calendário pessoal da clínica = **FullCalendar** (reusa render puro `modules/calendar/calendar-inner` + `color-picker`, sem lógica de domínio) com `ClinicEventDialog`/`ClinicUserCalendar` próprios (actions de clínica).
- Embutido na aba **`/appointments`** via `AppointmentsCalendarToggle`: título "Agendamentos / Calendário" (Agendamentos ativo/preto default, Calendário cinza), troca com slide (esquerda/direita). Agendamentos de paciente seguem intactos; calendário pessoal é outro mundo (escopo clientId+userId).
- **Feriados = `ClinicHoliday`** (por clínica), lido em `getClinicCalendar` (formato `CalendarEvent`/`CalendarHoliday` do admin p/ reusar o render).
- Sync atividade→calendário usa repo de clínica (herda clientId). `/agenda` lean + componente removidos; nav sem item Calendário (vive em Agendamentos). revalidate `/agenda`→`/appointments`.
- tsc verde; lint 0 erros (2 warnings iguais ao event-dialog do admin).

### S2 — Decisões Fase 3 + UI completa de atividades

- **Permissão (bloqueador):** `CLIENT_OWNER`/`CLIENT_STAFF` não tinham módulo `activities` → `assertCan` barrava clínica. Adicionado (OWNER r/w/d, STAFF r/w). Cobre atividades E calendário (mesmo módulo).
- **Discriminador `domain` (Activity):** enum `ActivityDomain` (ADMIN|CLINIC) + coluna default ADMIN. Migration `20260521000000_activity_domain` (aditiva, aplicada local). Admin repo filtra `domain=ADMIN`; clínica `domain=CLINIC`. **Resolve vazamento bidirecional:** tarefa da clínica não aparece no painel admin; etiqueta-CRM do admin não vaza pra clínica. Admin segue etiquetando por clínica (clientId como label).
- **Membership cargo-agnóstico:** assignee/fan-out/recipients/membros da clínica agora filtram por `clientId` (não `role IN`). clientId só existe em user de clínica → exclui agência e fica pronto p/ cargos futuros.
- **UI de atividades da clínica = espelho do admin:** `components/clinic/activities/` (ClinicActivitiesPage + Card + CreateDialog + QuickAdd). Pastas por membro, fan-out "Todos", quick-add + dialog completo, mark-seen, abas, banner de atrasadas. Query `getClinicActivitiesPage` (lista+counts+membros+pref). Clínica colaborativa (todo membro vê pastas/atribui). Reusa display puro de `modules/activities/{types,folder-colors}` (realocar Fase 7).
- **Roles — avaliação:** sistema parcialmente pronto. 2 camadas: enum fixo de cargo + override por usuário (`UserPermission`, tem UI). Dá p/ múltiplos usuários com acesso distinto HOJE (override). NÃO dá p/ criar cargo novo dinâmico (precisa tabela Role+RolePermission no futuro).
- tsc + lint verdes. **Migration `activity_domain` aplicada em prod** (confirmado 2026-05-22 via `prisma migrate status`).

**Dívidas/pendências p/ Fases 5-8:**

- UI lean de atividades/calendário pode evoluir p/ paridade c/ admin (folders, FullCalendar) — quando o usuário quiser.
- `notification-icon` e constantes de `modules/activities/types` reusadas pela clínica → mover p/ `components/ui`/`shared` na limpeza (Fase 7).
- Cron de notificações (`notifications-job`) ainda processa os dois domínios juntos — split na Fase 8.
- Layout/sidebar ainda é único ramificado por role (Fase 5). Adicionei itens de nav da clínica no `buildClientNav` existente.
- Decisão feriados clínica (Fase 4) + testes de isolamento cross-tenant (Fase 8).

### S3 (2026-05-21) — FASES 5 e 6

**Fase 5 (layout separado):**

- Acabou o sidebar único ramificado por role. Criadas cascas BURRAS compartilhadas (sem noção de domínio/role): `components/layout/sidebar-shell.tsx` (`SidebarShell` + `NavItem`, chrome de colapsar/ativo/render) e `components/layout/topbar-shell.tsx` (`TopbarShell`, sino + menu de usuário; recebe `notificationsHref` pronto).
- Componentes de domínio finos: `components/admin/admin-sidebar.tsx` (`AdminSidebar`, dono do `buildAdminNav`), `components/clinic/clinic-sidebar.tsx` (`ClinicSidebar`, dono do `buildClinicNav`), `components/admin/admin-topbar.tsx` (fixa `/notifications`), `components/clinic/clinic-topbar.tsx` (fixa `/notificacoes`).
- Removidos `components/layout/app-sidebar.tsx` e `app-topbar.tsx` (e com eles o branch `isClientRole ? buildClientNav : buildAdminNav` e o `notificationsHref` mágico nos layouts).
- Layouts religados: `(admin)/layout` → `AdminSidebar`/`AdminTopbar`; `(client)/layout` → `ClinicSidebar`/`ClinicTopbar`.

**Decisão técnica (justificativa):** topbar não tinha branch de feature por role (só `notificationsHref` por prop), então split puro geraria duplicação boba (alertada na Fase 5). Optei por **casca burra compartilhada + wrapper por domínio**: mantém divisão total (cada domínio tem seu `*-sidebar`/`*-topbar` e fixa o destino do sino) sem duplicar ~200 linhas de chrome. Os branches que sobraram (`role==='ADMIN'` p/ Audit Log; owner vs staff p/ rótulo de Configurações) são permissão granular intra-domínio, não escolha de domínio.

**`(account)` (rotas de conta/`/settings`):** grupo compartilhado pelos 4 roles. Layout passou a montar a casca do DOMÍNIO correto por role (admin → sino/notif compartilhada por userId; clínica → `getClinicNotifications` escopado, igual ao `(client)/layout`). Escolha de casca por role aqui é roteamento de domínio, não branch de feature.

**Fase 6 (rotas/nav clínica + permissões):**

- Nav da clínica agora vive isolada no `ClinicSidebar` (itens novos `/atividades`, `/notificacoes` já presentes desde Fase 2/3; calendário pessoal embutido em `/appointments`, Fase 4 — sem item próprio).
- `assertCan(ctx,'activities','read')` adicionado em `getClinicActivitiesPage` (leitura). Writes/delete já gateavam (`activity-actions`). OWNER/STAFF têm read por padrão; override em `UserPermission` pode revogar (defesa em profundidade junto do escopo clientId+domain).
- Notificações: sem módulo de permissão (toda pessoa vê as próprias) — gate é o `getClinicContext` (domínio + clientId). Não adicionei módulo `notifications` ao `permissions.ts`.
- Revalidação já escopada ao domínio (`/atividades`,`/appointments`,`/overview` na action de clínica — Fase 3/4).

**Verificação:** `npx tsc --noEmit` **verde**. `eslint` nos arquivos tocados: 0 erros (2 warnings pré-existentes em `clinic-event-dialog`, idênticos ao event-dialog do admin). Runtime NÃO testado (sem ambiente local; DB é prod).

**Dívida p/ Fase 7:** página `(account)/settings` ainda é compartilhada pelos 4 roles (branch interno por role na própria página) — candidata a split por domínio na limpeza. Cascas `layout/*-shell` são o compartilhado legítimo (chrome burro) — documentar/manter.

### S3 (2026-05-21) — FASE 7 (limpeza/dead code)

**Shared consolidado (decisão S3):** display burro reusado pelos dois domínios saiu de `modules/*` p/ `components/shared/*`; tipos cross-camada p/ `src/shared`.

- `components/shared/notifications/{notification-icon,notification-bell}.tsx`, `components/shared/calendar/{calendar-inner,color-picker}.tsx`, `components/shared/activities/{types,folder-colors}.ts`, `components/shared/settings/{profile-form,change-password-form}.tsx`, `components/clinic/settings/clinic-settings-form.tsx`.
- `src/shared/calendar-types.ts` (`CalendarEvent`/`CalendarHoliday`) — fora de `components/` p/ o server importar sem inverter layering; `server/queries/calendar-queries` re-exporta p/ consumidores admin.
- Todos os imports (admin `modules/*` + clínica) reapontados. `components/shared/README.md` documenta o inventário e a regra ("na dúvida, não é shared").

**Settings split (decisão S3):** acabou o `(account)/settings` único role-branched.

- `(admin)/settings/page.tsx` — org/integrações/prefs (ADMIN) + perfil/senha. `(client)/configuracoes/page.tsx` — perfil/senha + dados da clínica (CLIENT_OWNER). Slug PT `/configuracoes` (route groups não namespaceiam URL; `/settings` é do admin, coexiste com `/settings/audit`).
- Grupo `(account)` removido (layout + page). `revalidatePath` de perfil agora cobre `/settings`+`/configuracoes`; dados-da-clínica revalida `/configuracoes`. Topbar ganhou `settingsHref` (admin `/settings`, clínica `/configuracoes`); nav da clínica aponta `/configuracoes`.

**Dead code / "clínica opera aqui":** `server/actions/activity-actions.ts` (admin) tinha branches `CLIENT_*` órfãos (clínica usa `domains/clinic/activities`). Removidos; guard de domínio concentrado no topo (`role ∈ {ADMIN,STAFF}` senão ForbiddenError) — melhora defesa-em-profundidade. `clientId` como etiqueta-CRM do admin **mantido** (§2.4, legítimo).

**Incidente (resolvido):** um passo de reapontamento via PowerShell/.NET corrompeu 7 arquivos (todo `f`→`r`). Recuperados de `git HEAD`; imports reaplicados via Edit. Lição: não usar `[System.IO.File]` em lote nesses arquivos — usar a ferramenta Edit.

**Verificação:** `npx tsc --noEmit` **verde**; `eslint src` 0 erros (5 warnings pré-existentes: 2× event-dialog admin, 2× clinic-event-dialog, 1× logger console). Cache `.next/types` stale limpo (referenciava o `(account)` removido). Runtime NÃO testado (DB é prod).

### S3 (2026-05-21) — FASE 8 (hardening/testes)

- **Isolamento:** `src/domains/clinic/clinic-isolation.test.ts` — 21 testes, prisma mockado, provam que os 3 repos de clínica (activities/notifications/calendar) forçam `clientId`/`data.clientId` e clínica vizinha nunca vaza num `where`. `npx vitest run` = **128 passed (13 files)**.
- **Cron notif:** `notifications-job` ganhou `domainRouting(a)` — atividade `domain==='CLINIC'` notifica com link `/atividades` + `clientId`; agência `/activities` sem clientId. Corrige §4 (antes: clínica caía com link admin e sem clientId → nem aparecia no sino da clínica).
- **Perf:** telas de clínica usam `take`+índices `[clientId,...]`, sem N+1. Resíduo: cron `findDue/OverdueActivities` varre tabela toda (status+dueDate, sem clientId) — documentado no relatório, precisa índice+medição em prod.
- **Logs:** sem PII (só userId/activityId/error).
- **Relatório final:** `prompt/reforma-relatorio.md` (mapa antes×depois, migrations, riscos, DoD §9 checado).
- tsc verde; eslint 0 erros nos arquivos novos.

## Pendências e riscos abertos

- ~~**APLICAR MIGRATION (bloqueia runtime das Fases 2-4)**~~ — **RESOLVIDO (2026-05-22):** usuário rodou `npx prisma migrate deploy` contra prod. `prisma migrate status` confirma "Database schema is up to date!" (15 migrations, incluindo `domain_scope` e `activity_domain`). Runtime das Fases 2-4 desbloqueado.
- **SEGREDOS EM `.env` (não-git? confirmar):** `.env` contém chave do DB (Accelerate+direct), `NEXTAUTH_SECRET`, `RESEND_API_KEY`. Não aparece no git status (provável gitignore). Se algum dia foi commitado, rotacionar.
- `next` corrigido `^9.3.3`→`^16.2.6` (era bug pré-existente que travava install). Lockfile regenerado.
- `assertCan` aceitava `TenantContext`; agora `Pick<TenantContext,'userId'|'role'>` (widening seguro).
- Achado P0 (§1.2) **RESOLVIDO no spine**: repo de clínica força `clientId`. Falta plugar nas actions/rota da Fase 3 (até lá o painel admin segue como está, sem expor a clínica).
- Não existe `prompt/auditoria-*.md` nesta sessão.
