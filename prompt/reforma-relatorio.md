# Reforma "Divisão Total" Clínica × Admin — Relatório Final

**Data:** 2026-05-21 · **Sessões:** S1–S3 · **Status:** Fases 0–8 concluídas.
Ledger detalhado em [`reforma-progresso.md`](./reforma-progresso.md).

## 1. O que mudou (resumo executivo)

Os dois domínios — **Admin/agência** e **Clínica** — agora vivem isolados em
funcionalidade no mesmo repo/deploy/banco. A clínica virou tenant de 1ª classe:
tem rotas, server actions, queries, repositories e componentes próprios, com
escopo `clientId` garantido por tipo (`ClinicContext`) numa camada impossível de
esquecer. O compartilhado se resume a primitivos de UI, display burro e infra
transversal.

## 2. Mapa de acoplamento — antes × depois

| Recurso         | Antes                                                      | Depois                                                                                            |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Contexto        | `getTenantContext` único p/ 4 roles                        | `getAdminContext` / `getClinicContext` (clientId `string` não-nulo na clínica)                    |
| Atividades      | 1 repo/action `organizationId`-scoped, `clientId` opcional | `domains/clinic/activities/*` força `clientId`+`domain=CLINIC`; admin filtra `domain=ADMIN`       |
| Calendário      | 1 repo `organizationId`+`userId`                           | `domains/clinic/calendar/*` força `clientId`; sync herda clientId                                 |
| Notificações    | service/queries únicos por `userId`                        | `domains/clinic/notifications/*` escopa `clientId`+`userId`; dispatch grava `clientId`            |
| Rotas clínica   | só dashboard read-only                                     | `/atividades`, `/notificacoes`, calendário em `/appointments`, `/configuracoes`                   |
| Layout/nav      | `app-sidebar`/`app-topbar` únicos ramificados por role     | casca burra `layout/*-shell` + `components/{admin,clinic}/*-sidebar/-topbar`                      |
| Settings        | `(account)/settings` único role-branched                   | `(admin)/settings` + `(client)/configuracoes`; forms perfil/senha em `components/shared/settings` |
| Display reusado | clínica importava de `modules/*` (home do admin)           | `components/shared/*` (display) + `src/shared/calendar-types` (tipos cross-camada)                |

## 3. Migrations aplicadas (prod)

- `20260520000000_domain_scope` — `CalendarEvent.clientId?`, `Notification.clientId?`, índices `[clientId, startAt]` / `[clientId, readAt]` / `Activity[clientId, status, dueDate]`, FK `ON DELETE SET NULL`, backfill idempotente. **Aplicada (S1).**
- `20260521000000_activity_domain` — enum `ActivityDomain (ADMIN|CLINIC)` + coluna default ADMIN. **Aplicada local; precisa ir p/ prod no próximo deploy.**

## 4. Segurança — isolamento provado

- Repos de clínica injetam `where.clientId = ctx.clientId` (e `domain=CLINIC` nas atividades) **incondicionalmente** — corrige o P0 do §1.2.
- Assignee/fan-out/recipients/membros filtram por `clientId` (membership cargo-agnóstico): nunca varrem a org nem incluem agência.
- **Suíte de isolamento** ([`src/domains/clinic/clinic-isolation.test.ts`](../src/domains/clinic/clinic-isolation.test.ts)): 21 testes mockam o prisma e provam que toda função dos 3 repos de clínica força `clientId`/`data.clientId` e a clínica vizinha (`clinic-B`) nunca aparece num `where`. **Verde.**
- Cron de notificações agora roteia por domínio: atividade de clínica notifica com link `/atividades` **e** `clientId` (antes caía com link admin e sem clientId — clínica nem via).

## 5. Performance

- Telas novas da clínica: queries com `take` (200/25/range), `include` na query única (sem N+1), `where` começando por `clientId` → usa os índices da Fase 1.
- Revalidação escopada ao domínio que muda.

## 6. Riscos residuais / próximos passos

1. **Cron `findDueActivities`/`findOverdueActivities` varre a tabela inteira** filtrando só `status`+`dueDate` (ambos domínios). Não regrediu, mas escala mal. Recomendado: índice `[status, dueDate]` (ou `[domain, status, dueDate]`) + paginação; medir antes/depois. Não feito aqui (precisa migration + medição em prod).
2. **Migration `activity_domain` p/ prod** no próximo deploy (já aplicada local).
3. **Runtime nunca testado** localmente — `.env` aponta p/ produção (Accelerate/Vercel), sem dev DB. Toda verificação foi `tsc`/`eslint`/`vitest` (mock). Recomendado um smoke test manual pós-deploy nas telas da clínica.
4. **Rename `(client)` → `(clinic)` + namespacing definitivo de rota** (hoje slugs PT `/atividades`,`/notificacoes`,`/configuracoes`): decisão = **fase isolada própria pós-7** (cosmético, alto churn). Pendente.
5. **Feature flag `CLINIC_FEATURES_ENABLED`**: não adotada — release por fase validada (§6). Decidir se quer rollout gradual.
6. **Page `(client)` legadas** (overview/insights/goals/crm/financial/patients/appointments/procedures) ainda usam actions/queries compartilhadas com `assertClientAccess` (admin acessa qualquer clínica da org). Fora do escopo desta reforma (que isolou atividades/calendário/notificações/settings/layout); avaliar num próximo ciclo se "divisão total" deve alcançá-las.

## 7. Definition of Done (§9) — checagem

- [x] Nenhum componente/action/repo/service de **feature** compartilhado entre Admin e Clínica (sobrou só `components/ui`, `components/shared` display burro, `src/shared` tipos, `lib/`, núcleo auth/tenant).
- [x] Dado operacional de clínica escopado por `clientId` em camada tipada (`ClinicContext`).
- [x] Testes de isolamento cross-tenant passam.
- [x] Índices cobrem os `where`/`orderBy` das telas novas; sem N+1.
- [x] `tsc`/`eslint` limpos; sem dead code de role-branching de feature.
- [x] Relatório final (este documento).
