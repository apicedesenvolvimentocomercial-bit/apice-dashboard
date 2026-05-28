# CLAUDE.md

Guia do repositório para agentes. Mantenha factual e curto; ao mudar arquitetura,
atualize aqui. Ledgers detalhados de features grandes vivem em `prompt/*.md` —
este arquivo é o índice + as convenções que valem para todo código novo.

## O produto

**Senno** (`senno`) — dashboard SaaS multi-tenant para uma agência
("Senno") que gere várias clínicas de estética. Dois domínios coabitam o mesmo
deploy/banco:

- **Admin / agência** — visão cross-clínica (ranking, KPIs globais, gestão de clientes).
- **Clínica** — tenant de 1ª classe: pipeline/CRM, financeiro, pacientes, agenda,
  metas, atividades, insights, procedimentos, configurações.

## Stack

- **Next.js 16** (App Router, Turbopack, React 19) + **TypeScript**.
- **Prisma 6** + **PostgreSQL**. Prod = Supabase; testes E2E = Neon (descartável).
- **NextAuth v5 (beta)** — credenciais (email/senha, bcrypt). JWT carrega
  role/orgId/clientId/clinicRoleId; re-sync do DB a cada ~10 min.
- **Tailwind** + **shadcn/ui** (Radix). **Recharts** (gráficos), **FullCalendar** (agenda),
  **dnd-kit** (kanban), **react-hook-form + zod**, **sonner** (toasts), **Sentry**.
- Testes: **Vitest** (unit, mock do Prisma) + **Playwright** (E2E).

## Arquitetura

Camadas no servidor (fluxo: rota → action/query → repository/service → Prisma):

| Camada           | Pasta                                            | Papel                                                      |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Rotas/páginas    | `src/app/(admin\|clinic\|auth)/`                 | Server components; gate de acesso no topo.                 |
| Server actions   | `src/server/actions/`                            | Mutations `'use server'`; `assertCan` + zod + revalidate.  |
| Queries          | `src/server/queries/`                            | Leitura; gate + escopo de tenant.                          |
| Repositories     | `src/server/repositories/`                       | Acesso ao Prisma; injetam o filtro de tenant.              |
| Services         | `src/server/services/`                           | Regra de negócio (KPIs, insights, conversão de lead).      |
| Domínio clínica  | `src/domains/clinic/`                            | Atividades/calendário/notificações com `clientId` forçado. |
| UI por domínio   | `src/components/{admin,clinic}/`, `src/modules/` | Telas e widgets de cada lado.                              |
| UI compartilhada | `src/components/ui`, `src/components/shared`     | Primitivos + display burro (sem regra de negócio).         |

**Divisão Admin × Clínica (reforma "Divisão Total"):** os dois domínios são
isolados em **funcionalidade** — nenhum component/action/repo/service de feature é
compartilhado. Só primitivos de UI, display burro (`components/shared`), tipos
(`src/shared`), `lib/` e o núcleo auth/tenant cruzam a fronteira. Detalhe em
`prompt/reforma-relatorio.md` (+ ledger `reforma-progresso.md`).

### Contexto de tenant (regra de ouro)

- `getTenantContext()` — base. `getAdminContext()` / **`getClinicContext()`** especializam.
- **`ClinicContext.clientId` é `string` não-nulo.** Todo dado operacional de clínica
  passa por ele; o repo injeta `where.clientId = ctx.clientId` **incondicionalmente** —
  esquecer vira erro de tipo, não vazamento. Atividades também forçam `domain=CLINIC`.
- `ClinicContext` também expõe `clinicRoleId` e `isOwner` (a "coroa", lida do DB por
  request para refletir transferência de titularidade na hora — não vem do JWT).
- **`organizationId` desnormalizado (invariante assumida):** modelos operacionais
  (`Lead`, `Revenue`, `Cost`, `Procedure`, `Patient`, `Appointment`, `Goal`, `Insight`,
  `PipelineDeal`, `KpiSnapshot`) carregam `organizationId` **além** de `clientId`. É
  desnormalização proposital — permite queries cross-clínica do admin (filtrar por org
  sem join a `Client`). **A invariante `organizationId == client.organizationId` é mantida
  só pelo código** (todo write grava ambos do mesmo `ctx`); não há FK p/ `Organization`
  nesses modelos nem `CHECK`/trigger no banco. Hoje é seguro porque nenhum caminho escolhe
  `organizationId` independente do `clientId` (ambos vêm do mesmo JWT/sessão). **Se um dia
  entrar transferência de lead/cliente entre orgs, adicione FK + verificação** antes — a
  barreira de tenant da app confia nesse campo.

### Permissões (`src/server/auth/`)

- `permissions.ts` — **ponto único de decisão.** `can()` (async) / `canSync()` (sync, sem DB).
  **DENY-BY-DEFAULT** (ledger `agency-roles-progresso.md`): o role só discrimina domínio; toda
  permissão vem da coroa ou de um cargo. Ordem: ADMIN → tudo; titular da clínica → tudo;
  STAFF com `agencyRoleId` → lê `AgencyRole.permissions[module]`; CLIENT\_\* com `clinicRoleId` →
  lê `ClinicRole.permissions[module]`; **sem cargo e sem coroa → NEGADO** (gate de rota expulsa
  p/ /login). Não há mais `UserPermission` nem concessão via `ROLE_DEFAULTS`.
- **Cargos** (`ClinicRole` p/ clínica, `AgencyRole` p/ agência — isolados, espelhados): mesmo JSON
  de permissões; helpers neutros em `role-permissions.ts` (`roleCan`, `canActOnRoleLevel`).
  `clinic-permissions.ts` é só reexport compat. **Hierarquia LINEAR:** cada cargo tem `level`
  (menor = mais alto); quem gerencia cargos (`canManageRoles`) só atua sobre cargos de level maior
  que o seu — não promove acima de si nem mexe em par. Coroa/ADMIN está acima de tudo.
- `assert-can.ts` — `assertCan(ctx, module, action)` no topo de cada action/query.
- **Cargos de clínica** (`ClinicRole`): permissões por aba num JSON
  (`access` master + `read/write/delete/assignToOthers/viewAll`). Aba sem `access`
  some da sidebar **e** bloqueia a rota (`clinic-tabs.ts`: `gateClinicTab`). Visibilidade
  de dashboard por cargo vive na chave `dashboard` do mesmo JSON (`dashboard-visibility.ts`).
  Tipos/helpers em `clinic-permissions.ts`. Ledger: `prompt/cargos-progresso.md`.
- Ações válidas: `read | write | delete | assignToOthers | viewAll`.
- Módulos: `clients, crm, financial, insights, goals, patients, appointments,
procedures, activities, reports, staff, settings`.

### RLS (defesa em profundidade) — `prompt/rls-gambiarra.md`

Isolamento entre clínicas no **nível do banco**, além do filtro de app:

- `getClinicContext()` chama `enterClientScope(clientId)` (AsyncLocalStorage).
- A extensão do Prisma (`src/lib/prisma.ts`) injeta `set_config('app.current_client_id', …, true)`
  na mesma transação de cada query de modelo. Admin não seta GUC → policy libera tudo.
- **A app DEVE conectar como role `NOBYPASSRLS`** (não o dono do banco) senão a RLS é
  ignorada. `DATABASE_URL` = role restrito (pooled); `DIRECT_URL` = dono (migrations).
- **Tabela nova com `clientId`** → adicione à migration de RLS (ENABLE + FORCE + policy),
  senão nasce sem defesa no banco. Raw queries não passam pela extensão — evite-as para
  dado de clínica, ou injete a GUC manualmente. A RLS é a 2ª camada; **nunca** remova o
  filtro de app "porque agora tem RLS".
- **SEMPRE fixe o escopo de RLS em todo entrypoint de clínica.** Páginas/actions/queries
  da clínica resolvem via `getClinicContext()`, que já chama `enterClientScope`. Mas
  **entrypoints que NÃO passam por ele** — rotas de API (`src/app/api/**`), jobs, webhooks —
  rodam com GUC nula (= contexto admin, policy libera a org inteira) e a RLS fica inerte.
  Em qualquer rota/handler que sirva dado de UMA clínica, chame `enterClientScope(clientId)`
  logo após `assertClientAccess(ctx, clientId)` (ver `api/reports/[clientId]` e
  `api/export/[clientId]`). Jobs cross-clínica (crons admin) são exceção legítima: GUC nula
  é o correto. Cobertura: `e2e/clinic-isolation.spec.ts` (rotas) + `npm run rls:check` (banco).

## Cores / tema (dark-mode-safe)

O dark mode usa **classe + tokens semânticos** (`tailwind.config.ts: darkMode:['class']`,
tokens em `src/app/globals.css` sob `:root` e `.dark`). A cor resolve por cascata de CSS a
partir da classe `.dark` no `<html>` — então UI nova fica correta nos dois temas **sem
importar nada nem consumir hook**, desde que nomeie a cor pelo papel, não pelo valor.

**Regra:** use classes de cor **semânticas** para texto, fundo e borda de chrome. Nunca cores
fixas (`white`, `black`, `gray-*`, `slate-*`, `zinc-*`) nesses papéis.

**Pares fundo → texto** (todo fundo tem um `-foreground` que contrasta):

| Uso                              | Fundo            | Texto                         |
| -------------------------------- | ---------------- | ----------------------------- |
| Superfície base da página        | `bg-background`  | `text-foreground`             |
| Cartões / painéis                | `bg-card`        | `text-card-foreground`        |
| Popover / dropdown / dialog      | `bg-popover`     | `text-popover-foreground`     |
| Ação primária / destaque (marca) | `bg-primary`     | `text-primary-foreground`     |
| Secundário (chip, botão suave)   | `bg-secondary`   | `text-secondary-foreground`   |
| Área suave / hover               | `bg-accent`      | `text-accent-foreground`      |
| Zona apagada (placeholder/faixa) | `bg-muted`       | `text-muted-foreground`       |
| Erro / destrutivo                | `bg-destructive` | `text-destructive-foreground` |

- Texto secundário → `text-muted-foreground` (não `text-gray-500`).
- Bordas → `border-border`; input → `border-input`; foco/anel → `ring-ring`.
- Cor da marca (dourado Senno) = `--primary`. Light = dourado escurecido (`hsl(42 53% 42%)`, ≈`#A88234`); dark = dourado mais claro (`hsl(42 65% 58%)`) p/ contraste. Use `bg-primary`/`text-primary`, nunca hex.

**De → para** (erro comum → certo):

| Não use                        | Use                                            |
| ------------------------------ | ---------------------------------------------- |
| `bg-white`                     | `bg-background` (página) ou `bg-card` (cartão) |
| `text-black` / `text-gray-900` | `text-foreground`                              |
| `text-gray-500` / `-600`       | `text-muted-foreground`                        |
| `border-gray-200`              | `border-border`                                |
| `bg-gray-100` / `-50`          | `bg-muted`                                     |

**`dark:` explícito** só quando nenhum token cobrir — tipicamente **tons de status** (sucesso/
aviso/erro com fundo claro). Aí escreva os dois lados, ex.:
`bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`
(padrão já usado em `clinic-activity-card.tsx`). Fora status, prefira o token.

> O `ThemeProvider` (`next-themes`) ainda **não** está montado no layout raiz — o app
> roda fixo no claro. Quando for ligado, `useTheme()` vive só no botão de troca, nunca nas
> telas. Seguir esta convenção garante que cada aba já nasça pronta para os dois temas.

## Convenções de código

- **Server actions** retornam `Result<T>` (`ok()`/`fail()` de `src/types/errors.ts`).
  Envolva o corpo em `runAction()` quando lançar `AppError`. Valide input com zod.
  Chame `assertCan` antes de qualquer efeito; `revalidatePath` depois.
- **Posições de drag** (kanban): `position` é `Float` fracionário (insere entre dois
  cards sem renumerar) — ver `src/lib/dnd-position.ts`.
- **Datas**: fuso da app = `America/Sao_Paulo`; use os helpers de `src/lib/date.ts`
  (`spDate`, `parseLocalDate`), não `new Date(string)` cru.
- **Auditoria**: mutations relevantes chamam `createAuditLog(ctx, {...})` (best-effort,
  `.catch(()=>{})`). Tipos de entidade em `audit-repository.ts` — adicione o novo lá.
- Pre-commit (husky + lint-staged) roda `eslint --fix` + `prettier`. Não burle hooks.

## Ambiente & comandos

- **`.env` = PRODUÇÃO (Supabase).** Não rode a app contra ele para testar; o usuário
  aplica migrations em prod (`prisma migrate deploy`). Verificado nesta sessão:
  prod=Supabase, `.env.test`=Neon (DBs distintos).
- **E2E / verificação** usa o Neon descartável via `.env.test`:
  - `npm run test:e2e` — Playwright (sobe `next dev` herdando `DATABASE_URL`=Neon via
    `dotenv -e .env.test`). Cold-start pode estourar; pré-aqueça `/login`.
  - `npm run seed:test` — seed E2E (admin@senno.dev/admin123, owner-a@senno.dev/owner123 →
    Clínica Alpha, owner-b → Clínica Bravo).
  - `npm run migrate:test` — aplica migrations no Neon.
  - `npm run rls:diag` / `rls:check` — provam que a RLS enforça.
- Build/qualidade: `npm run build` · `npm run type-check` (`tsc --noEmit`) ·
  `npm run lint` · `npm test` (vitest).

## Ledgers (fonte da verdade de features grandes — `prompt/`)

- `reforma-relatorio.md` / `reforma-progresso.md` — divisão Admin × Clínica.
- `rls-gambiarra.md` — RLS: desenho, role restrito, footguns. **Ler antes de mexer em
  query/tenant/conexão/tabela com clientId.**
- `cargos-progresso.md` — cargos configuráveis + titularidade (Etapa 1), metas por
  usuário/cargo (Etapa 2), lacunas + visibilidade de dashboard por cargo (Etapa 3).
- `fase11-progresso.md` — infra de testes E2E.
- `auditoria-*.md`, `deploy-checklist.md` — achados de auditoria e checklist de deploy.
