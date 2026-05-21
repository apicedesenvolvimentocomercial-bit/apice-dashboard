# Reforma Divisão Total — Progresso

## Decisões travadas

- Arquitetura: mesmo repo, domínios isolados.
- Escopo de dado: **`clientId` nullable** (deriva domínio: `clientId != null ⇒ clínica`). Decidido pelo usuário S1.
- Feature flag: **A DECIDIR** (`CLINIC_FEATURES_ENABLED`?).
- Feriados na clínica: A DECIDIR (Fase 4).

## Status por fase

| Fase | Título                | Status              | Sessão          | Notas                                                                                                                |
| ---- | --------------------- | ------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0    | Contextos de domínio  | CONCLUÍDA           | S1 (2026-05-20) | Contextos criados; typecheck verde. Adoção distribuída p/ Fases 2-8.                                                 |
| 1    | Escopo de dados       | CONCLUÍDA           | S1              | Migration+backfill APLICADOS pelo usuário. Schema/índices/FK em prod.                                                |
| 2    | Notificações isoladas | CONCLUÍDA           | S1              | Repo+actions+query+rota `(client)/notifications`+componente+nav. dispatch grava clientId. Falta cron split (Fase 8). |
| 3    | Atividades isoladas   | CONCLUÍDA           | S1              | P0 resolvido (clientId forçado). Repo+actions+query+rota+UI lean+nav. Fan-out/assignee só CLIENT\_\* mesma clínica.  |
| 4    | Calendário isolado    | CONCLUÍDA (UI lean) | S1              | Repo+actions+query+rota+UI agenda lean+nav. Sync herda clientId. Feriados: pendente decisão; UI lean sem OrgHoliday. |
| 5    | Layout separado       | PENDENTE            | —               |                                                                                                                      |
| 6    | Rotas/nav clínica     | PENDENTE            | —               |                                                                                                                      |
| 7    | Limpeza/dead code     | PENDENTE            | —               |                                                                                                                      |
| 8    | Hardening/testes      | PENDENTE            | —               |                                                                                                                      |

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

**Dívidas/pendências p/ Fases 5-8:**

- UI lean de atividades/calendário pode evoluir p/ paridade c/ admin (folders, FullCalendar) — quando o usuário quiser.
- `notification-icon` e constantes de `modules/activities/types` reusadas pela clínica → mover p/ `components/ui`/`shared` na limpeza (Fase 7).
- Cron de notificações (`notifications-job`) ainda processa os dois domínios juntos — split na Fase 8.
- Layout/sidebar ainda é único ramificado por role (Fase 5). Adicionei itens de nav da clínica no `buildClientNav` existente.
- Decisão feriados clínica (Fase 4) + testes de isolamento cross-tenant (Fase 8).

## Pendências e riscos abertos

- **APLICAR MIGRATION (bloqueia runtime das Fases 2-4):** `.env` aponta p/ PRODUÇÃO (Accelerate/db.prisma.io, app `assessoriaapice.vercel.app`). Não rodei migration nem backfill. Rodar `npx prisma migrate deploy` (aditivo) contra prod ou um dev DB. Sem isso, qualquer código que leia `Notification.clientId`/`CalendarEvent.clientId` quebra em runtime.
- **SEGREDOS EM `.env` (não-git? confirmar):** `.env` contém chave do DB (Accelerate+direct), `NEXTAUTH_SECRET`, `RESEND_API_KEY`. Não aparece no git status (provável gitignore). Se algum dia foi commitado, rotacionar.
- `next` corrigido `^9.3.3`→`^16.2.6` (era bug pré-existente que travava install). Lockfile regenerado.
- `assertCan` aceitava `TenantContext`; agora `Pick<TenantContext,'userId'|'role'>` (widening seguro).
- Achado P0 (§1.2) **RESOLVIDO no spine**: repo de clínica força `clientId`. Falta plugar nas actions/rota da Fase 3 (até lá o painel admin segue como está, sem expor a clínica).
- Não existe `prompt/auditoria-*.md` nesta sessão.
