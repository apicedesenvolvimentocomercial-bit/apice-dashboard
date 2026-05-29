# RLS (Row Level Security) — Desenho, Gambiarra e Footguns

> **Leia antes de mexer em qualquer query, contexto de tenant, conexão de banco
> ou tabela com `clientId`.** Aqui mora a defesa-em-profundidade de isolamento
> entre clínicas no nível do banco. Construir errado aqui = vazamento cross-tenant
> ou app quebrada.

## 1. O problema

A app é **NextAuth + Prisma**, não Supabase Auth. A conexão com o banco não sabe
"qual clínica está logada" — o Prisma só abre conexão e dispara SQL. Para a RLS
do Postgres filtrar por clínica, alguém precisa avisar o banco, a cada query,
qual é o `clientId` corrente. Fazemos isso com uma **GUC** (variável de sessão):

```sql
SET app.current_client_id = 'clinic-a';   -- (via set_config(..., true) = local à transação)
```

E a policy de cada tabela com `clientId` usa essa GUC.

## 2. O desenho (3 peças)

### a) `AsyncLocalStorage` — `src/server/tenant/client-scope.ts`

Guarda o `clientId` da clínica no contexto assíncrono do request. Só o
**contexto de clínica** seta (`getClinicContext` chama `enterClientScope`).
Admin/STAFF **não** setam → GUC fica vazia → a policy libera tudo (admin vê todas
as clínicas da org, por design).

### b) Extensão do Prisma — `src/lib/prisma.ts`

Intercepta **toda operação de modelo** (`$allModels.$allOperations`). Se há
`clientId` no escopo, injeta a GUC **na mesma transação** da query (array
`$transaction([set_config, query])` = uma conexão, um `SET LOCAL`):

```ts
const clientId = currentClientId()
if (!clientId) return query(args) // admin → roda direto
const [, result] = await client.$transaction([
  client.$executeRaw`SELECT set_config('app.current_client_id', ${clientId}, true)`,
  query(args),
])
return result
```

`$executeRaw` **não** é op de modelo → não dispara o hook → sem recursão.

### c) Policies + FORCE RLS — `prisma/migrations/20260522000000_rls_tenant_isolation/`

Cada tabela com `clientId` ganha a policy `tenant_isolation`:

```sql
USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
       OR "clientId" = current_setting('app.current_client_id', true))
```

- GUC vazia/nula (admin) ⇒ libera tudo.
- GUC setada (clínica) ⇒ só linhas daquela clínica.

`User` é **deliberadamente excluída** (a query de login roda sem GUC e não pode
ser filtrada por clínica).

## 3. ⚠️ O REQUISITO QUE QUASE TODO MUNDO ERRA: o role de conexão

**RLS só vale para roles SEM o atributo `BYPASSRLS`.** O role dono do banco
(`neondb_owner` no Neon, `postgres` no Supabase) normalmente **tem `BYPASSRLS`**
e/ou é dono das tabelas — e **ignora as policies** mesmo com `FORCE RLS`.

> Validamos isto na marra: conectando como `neondb_owner`, `findMany()` sem
> `where` retornava as DUAS clínicas (RLS ignorada). Conectando como um role
> `app_user` criado com `NOBYPASSRLS`, passou a retornar só a clínica da GUC.

**Portanto a app DEVE conectar como um role dedicado, sem `BYPASSRLS` e que não
seja dono das tabelas.** As migrations continuam rodando como dono (`DIRECT_URL`).

- `FORCE ROW LEVEL SECURITY` é necessário para a policy valer até para o dono das
  tabelas — mas **não vence `BYPASSRLS`**. Os dois juntos: role restrito + FORCE.

## 4. Setup do role restrito (`prisma/rls-setup-role.ts`)

```
CREATE ROLE app_user LOGIN PASSWORD '...';   -- nasce NOBYPASSRLS/NOSUPERUSER
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO app_user;
```

`DATABASE_URL` (runtime) → `app_user`. `DIRECT_URL` (migrations) → dono.

## 5. Footguns (NÃO construa errado)

1. **String vazia ≠ NULL.** Depois de um `set_config(local=true)`, a GUC custom
   reverte para **`''`** (não NULL) na mesma conexão. Numa conexão reusada, um
   request admin veria `''` e — sem o `NULLIF(..., '')` na policy — **zero linhas**
   (admin quebrado). Por isso a policy usa `NULLIF(current_setting(...), '') IS NULL`.

2. **`$transaction` em contexto de clínica.** Hoje os 6 `$transaction` do código
   são todos admin-context (sem GUC → o extension não embrulha → sem aninhamento).
   **Se você criar um `$transaction` rodando sob clínica**, o extension tentaria
   abrir transação dentro de transação → erro/queda. Nesse caso, **seta a GUC
   manualmente como 1ª instrução do seu `$transaction`** e garanta que o escopo
   está ativo. NÃO confie no extension dentro de uma transação interativa.

3. **Raw queries (`$queryRaw`/`$executeRaw`) NÃO passam pelo extension.** Hoje não
   existe nenhuma no `src`. Se adicionar uma que toca tabela de clínica, ela roda
   **sem GUC** → RLS bloqueia (volta vazia) sob escopo de clínica. Seta a GUC na
   mesma transação manualmente, ou não use raw para dado de clínica.

4. **Nova tabela com `clientId`** → adicione-a à lista do migration de RLS (ENABLE
   - FORCE + policy). Sem isso, a tabela nova fica **sem** defesa no banco.

5. **`enterClientScope` usa `enterWith`** (não `run()`), porque server actions do
   Next não dão um ponto único para envolver. É seguro porque cada request é seu
   próprio contexto async. **Não** chame `enterClientScope` fora de
   `getClinicContext` nem em código admin (vazaria escopo de clínica para o admin).

6. **A RLS é a 2ª camada, não a 1ª.** A 1ª continua sendo o filtro de app
   (`getClinicContext` + `where.clientId`). A RLS existe para o dia em que o app
   esquecer o filtro. Não remova os filtros de app "porque agora tem RLS".

## 6. Rollout em PRODUÇÃO (ordem importa)

1. **Deploy do código primeiro** (extension + `enterClientScope`). Sem ele, ligar
   a RLS quebraria queries de clínica.
2. **Aplicar a migration** `20260522000000_rls_tenant_isolation` (`migrate deploy`
   como dono via `DIRECT_URL`). Inócuo enquanto a app conectar como dono/BYPASSRLS.
3. **Criar o role restrito** em prod (equivalente a `app_user`) e **trocar o
   `DATABASE_URL`** da app para ele (no endpoint **pooled**). Só aqui a RLS começa
   a valer de fato. Verifique antes se o role atual da app tem `BYPASSRLS`
   (`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`).
4. **Valide** com o `rls:check` apontando para prod (cuidado: cria/le dados).

## 7. Como provar que está funcionando

- `npm run rls:diag` — mostra o role atual, se tem `BYPASSRLS`, e se a RLS está
  ENABLE/FORCE nas tabelas.
- `npm run rls:check` — conecta como `app_user` e prova que `findMany()` **sem
  `where`** só retorna a clínica da GUC (e admin vê tudo). É a prova de que a RLS
  enforça sozinha, independente do filtro de app.
- `npm run rls:check:write` — prova que a RLS barra **escrita** cross-clínica
  (UPDATE mirando linha de outra clínica afeta 0 linhas) E que o filtro de app
  (belt: `clientId` no `where`) isola mesmo sem GUC.
- `npm run rls:check:ext` — prova que a EXTENSÃO real do app (`src/lib/prisma.ts`)
  enforça leitura+escrita sob `enterClientScope` — fecha a lacuna de que `rls:check`
  usa client cru + `set_config` manual, não a extensão.
- E2E (`npm run test:e2e`) — app inteira como `app_user`, isolamento de clínica
  na UI (owner A só vê dados da clínica A).

## 8. Tabelas cobertas

Patient, Appointment, Procedure, ProcedureCategory, Lead, Revenue, Cost, Goal,
Insight, Activity, CalendarEvent, Notification, PipelineDeal, Pipeline,
PipelineStage, MarketingCampaign, KpiSnapshot, ClinicHoliday, Invitation,
RevenueProcedure, ClinicRole.

**Fora:** `User` (login roda sem GUC); tabelas-filhas sem `clientId` direto
(ex.: `LeadInteraction`) — protegidas via app + tabela-pai. Se precisar de RLS
nelas, use policy com subquery no pai.

## 9. Belt + suspenders (rollout que tornou a RLS de fato ativa)

A RLS estava DESENHADA mas **dormente** na prática: só `src/domains/clinic/*` (que usa
`getClinicContext` → `enterClientScope`) e as rotas de API entravam escopo. A maioria das
actions/queries de clínica usa `getTenantContext()` + `assertClientAccess(clientId)` (porque
admin também as chama numa clínica) e **não entrava escopo** → GUC nula → RLS inerte. Além
disso, mutações por-id filtravam só por `organizationId` (uma org tem várias clínicas) →
IDOR cross-clínica dentro da org, sem rede da RLS.

Padrão aplicado (financial, CRM/lead, pipeline, patient, procedure, goal, insight — mutations
e reads):

- **Suspenders:** `enterClientScope(clientId)` logo após `assertClientAccess(ctx, clientId)`
  em toda action/query de UMA clínica. Reativa a RLS naquele caminho.
- **Belt:** `clientId` no `where` de toda mutação/`findFirst` por-id (e nos lookups iniciais
  dos services tipo `winLead`). Não depende da RLS; fecha o IDOR mesmo com GUC nula.
- **`scopedTransaction`** (`@/server/tenant/scoped-transaction`) em toda transação interativa
  de clínica — extraído de `revenue-repository` para uso comum. Substituiu `prisma.$transaction`
  cru em `lead-service`, `pipeline-stage-effects`, `pipeline-stage-repository` (reorder batch).

**Exceções (org-scope é o correto, NÃO entrar escopo):** domínio admin/agência —
`getAdminDashboard`, `getInsightCountsByClinic`, `pipeline-deal-*`, `activity-actions` (admin,
`domain:'ADMIN'`), audit; e superfícies por-usuário (calendário pessoal da agência,
notificações) — isoladas por `userId`, não por `clientId`.

**Pendente:** `clinic-schedule`/`settings` já são seguros (belt presente / owner-gated / alvo
é o próprio `Client` validado), mas ainda não entram escopo (defesa-em-profundidade opcional).
