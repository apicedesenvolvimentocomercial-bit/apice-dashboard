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
  `PipelineDeal`, `Pipeline`, `KpiSnapshot`) carregam `organizationId` **além** de `clientId`. É
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
- **SEMPRE fixe o escopo de RLS em todo entrypoint de clínica.** `getClinicContext()` já
  chama `enterClientScope` — mas só `src/domains/clinic/*` o usa. A maioria das actions/queries
  de clínica usa `getTenantContext()` + `assertClientAccess(ctx, clientId)` (porque também são
  chamáveis pelo admin numa clínica específica). Esses NÃO entram escopo sozinhos: **chame
  `enterClientScope(clientId)` logo após `assertClientAccess(ctx, clientId)`**, igual às rotas
  de API (`api/reports/[clientId]`, `api/export/[clientId]`). Sem isso a GUC fica nula (=
  contexto admin, policy libera a org) e a RLS fica inerte naquele caminho. Exceção legítima:
  jobs/queries CROSS-clínica do admin (ex.: `getAdminDashboard`, `getInsightCountsByClinic`,
  `pipeline-deal-*`, audit) — GUC nula é o correto lá. Cobertura hoje em financial/CRM/pipeline/
  patient/procedure/goal/insight (mutations + reads) e nas rotas de API.
- **Belt + suspenders (padrão p/ mutações por-id de clínica).** `organizationId` sozinho NÃO
  isola entre clínicas da mesma org. Toda mutação/`findFirst` por id de tabela de clínica
  inclui **`clientId` no `where`** (belt — não depende da RLS) **E** a action entra escopo
  (suspenders — RLS como rede). `assertClientAccess(ctx, clientId)` valida só que o `clientId`
  _passado_ é do caller, não que o registro-alvo pertence a ele — por isso o `clientId` no
  `where` é obrigatório.
- **Transação interativa de clínica → `scopedTransaction`** (`@/server/tenant/scoped-transaction`),
  **nunca** `prisma.$transaction` cru. Sob escopo de clínica a extensão de RLS embrulharia cada
  op da tx num `$transaction` próprio (tx aninhada → GUC numa conexão, query noutra → RLS inerte
  - atomicidade quebrada). `scopedTransaction` limpa o escopo e seta a GUC manualmente na MESMA
    transação. Vale também p/ a forma batch `$transaction([...])`.
- Cobertura: `e2e/clinic-isolation.spec.ts` (rotas/UI) + `npm run rls:check` (policy do banco) +
  `npm run rls:check:write` (RLS barra WRITE cross-clínica) + `npm run rls:check:ext` (a extensão
  real do app enforça leitura+escrita sob `enterClientScope`).

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
- **Dois tons de dourado (WCAG AA):** `text-primary` NÃO é o mesmo dourado de `bg-primary`.
  O dourado vivo como TEXTO sobre fundo claro dá só ~3.4:1 (< 4.5 AA), então `text-primary`
  usa um tom mais escuro `--primary-text` (`42 53% 33%` no light; `== --primary` no dark) via
  um override `.text-primary { color: hsl(var(--primary-text)) }` no FIM de `globals.css`
  (fora de `@layer`, vence a utility do Tailwind por ordem de fonte). `bg-primary` + texto
  segue `--primary` vivo com `--primary-foreground` ESCURO (não branco — branco no dourado =
  3.6:1). Ao criar cor/uso novo de marca: link/ícone-texto → `text-primary` (já escuro);
  botão/superfície → `bg-primary text-primary-foreground`. Variantes `hover:`/`/80` seguem o
  vivo de propósito (estado não-default não é testado por contraste).

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

> O `ThemeProvider` (`next-themes`) **está** montado no layout raiz (`src/app/layout.tsx`)
> com `defaultTheme="system"` + `enableSystem` — o app segue o SO até o usuário escolher
> claro/escuro (preferência no localStorage). `useTheme()` vive só nos botões de troca
> (`theme-toggle.tsx`, `appearance-form.tsx`), nunca nas telas — os tokens semânticos
> resolvem o resto por cascata da classe `.dark`. Seguir esta convenção garante que cada
> aba já nasça pronta para os dois temas.

## Convenções de código

- **Server actions** retornam `Result<T>` (`ok()`/`fail()` de `src/types/errors.ts`).
  Envolva o corpo em `runAction()` quando lançar `AppError`. Valide input com zod.
  Chame `assertCan` antes de qualquer efeito; `revalidatePath` depois.
- **Action/query que serve UMA clínica** (não via `getClinicContext`): após
  `assertClientAccess(ctx, clientId)`, chame **`enterClientScope(clientId)`** (liga a RLS);
  toda mutação/`findFirst` por-id leva **`clientId` no `where`** (não confie só em
  `organizationId` — a org tem várias clínicas); transação interativa usa **`scopedTransaction`**
  (`@/server/tenant/scoped-transaction`), nunca `prisma.$transaction` cru. Detalhe + exceções
  admin/por-usuário: seção RLS.
- **Export CSV**: neutralize formula injection — célula iniciada por `= + - @ \t \r` ganha
  prefixo `'` antes de escapar aspas (ver `escapeCsv` em `api/export/[clientId]/[resource]`).
  Vale também p/ qualquer CSV gerado no client.
- **Posições de drag** (kanban): `position` é `Float` fracionário (insere entre dois
  cards sem renumerar) — ver `src/lib/dnd-position.ts`.
- **Pipeline comercial × retenção (itens 6/7) — invariantes:**
  - **Conversão (`wonCount`) conta por `Lead.closedAt`**, NÃO pela etapa atual (`stage.isWon`).
    `closedAt` é setado ao FECHAR e limpo no retrocesso (`regressLeadStage`) — é o marcador
    durável. Não reintroduza filtro de etapa nem dependa da presença do card p/ KPI.
  - **Card "Fechado" migra p/ Retenção/Ativo no cron diário** (`retention-job`, 04:00 SP),
    no dia seguinte ao fechamento — o MESMO card move (sem duplicar; `closedAt`/`patientId`
    permanecem). O cron e o cadastro manual removem cards comerciais ATIVOS duplicados do
    mesmo cliente (dedup por phone/email/name — `retention-service.removeActiveCommercialDuplicates`).
  - **Etapa nativa de desfecho = "Cancelado"** (nativeKey segue `NO_SHOW`). Arrastar p/ ela
    decide `NO_SHOW` (entra na média) vs `CANCELED` (fora) via `Client.noShowWindowHours`
    (null = regra do mesmo dia) — `decideCancellationStatus` em `lib/no-show-window`. **Exige
    motivo** (dialog bloqueante `cancel-lead-dialog`): vai em `Appointment.cancelReason` +
    `Lead.lostReason` (passado via `moveLeadAction(..., cancelReason)`).
  - **Paciente criado ao AGENDAR** leva `Patient.fromScheduledLead=true`. A aba Pacientes
    mostra só "reais" (`fromScheduledLead=false` OU ≥1 `Appointment` ATTENDED) via filtro
    `onlyCompleted` — **não** aplique esse filtro ao picker de agendamento (precisa de todos).
  - **Compareceu (ATTENDED) completa o cadastro.** Arrastar p/ Compareceu abre dialog
    BLOQUEANTE (`attend-lead-dialog`→`attendLeadAction`→`attendLeadWithPatientData`) que exige
    os **5 campos** (nome, telefone, nascimento, email, cpf), marca o Patient como real
    (`fromScheduledLead=false`) e o Appointment `ATTENDED`. **Fechar EXIGE Appointment já
    `ATTENDED`** (`moveLeadWithEffect` retorna `not-attended` senão) — não auto-marca: arrastar
    Agendado→Fechado direto é bloqueado (passe por Compareceu). O atalho "Ganhou" do drawer foi
    REMOVIDO (burlava o fluxo). Cadastro manual de paciente (`createPatientAction`) também exige
    os 5 campos (`createPatientSchema`); `updatePatientAction` segue lenient.
  - **Excluir Appointment de pipeline retrocede o card** (`regressAppointmentToLead` via
    `regressAppointmentToLeadAction`): volta o card à etapa `LEAD` da mesma pipeline e desfaz os
    efeitos (`regressLeadStage` soft-deleta o Appointment). Sem card ligado = soft-delete normal.
    Aviso no dialog antes ("retrocederá para Lead").
  - **Card de Retenção atrelado ao Patient.** Sem "remover" no card de retenção; ele some só
    quando o paciente é excluído (`removeRetentionCardForPatient` em `deletePatientAction`).
    Lead excluído (qualquer pipeline) faz seus Appointments **piscarem** na agenda
    (`apt.lead.deletedAt != null` → classe `fc-event-lead-deleted`).
  - **Agendamento manual espelha card** (`syncPipelineCardForManualAppointment`, best-effort em
    `createAppointmentAction`): paciente "real" → garante card de Retenção em ATIVO; provisório/
    novo → card Comercial em Agendado ligado ao Appointment (reaproveita card comercial existente).
  - **Criar LEAD NOVO pela agenda.** `create-appointment-dialog` tem toggle "Paciente existente |
    Novo lead". No modo novo lead (nome/telefone/e-mail/origem/procedimento/obs + data do slot),
    `createScheduledLeadFromAgendaAction` → `createLeadScheduledFromAgenda` cria, em transação
    única, Lead na etapa **Agendado** do funil COMERCIAL + Patient provisório (`fromScheduledLead`)
    - Appointment SCHEDULED, ligados (espelho de `scheduleLeadAppointment` sem leadId prévio).
  - **Desfecho na AGENDA espelha o card (sync reverso bidirecional).** Os efeitos registrados na
    agenda movem o card comercial ligado (achado por `appointmentId`) para a etapa nativa do
    PRÓPRIO funil, em `scopedTransaction` (`pipeline-stage-effects`): Compareceu →
    `attendAppointment` (completa os 5 campos + ATTENDED + card→Compareceu; via novo
    `attend-appointment-dialog`, exige `patients:write`); Faltou/Cancelar → `cancelAppointmentSync`
    (status + card→Cancelado + `Lead.lostReason`); baixa financeira → `closeAppointmentCard`
    (card→Fechado + `closedAt`); remarcar → `syncLeadScheduledAt`. **O 1º desfecho registrado é a
    verdade**: arrastar Compareceu→Cancelado no funil avisa (banner âmbar `wasAttended` no
    `cancel-lead-dialog`) que desfaz comparecimento/baixa — não bloqueia. A agenda se protege
    sozinha (ATTENDED vira terminal → sem botão cancelar).
  - **Busca global** (`pipeline-search`): filtra leads de TODAS as pipelines em memória (dados já
    no SSR via `getClinicPipelinesWithStages`) por nome/telefone/email — client-side, sem servidor.
- **Datas**: fuso da app = `America/Sao_Paulo`; use os helpers de `src/lib/date.ts`
  (`spDate`, `parseLocalDate`), não `new Date(string)` cru.
- **Auditoria**: mutations relevantes chamam `createAuditLog(ctx, {...})` (best-effort,
  `.catch(()=>{})`). Tipos de entidade em `audit-repository.ts` — adicione o novo lá.
- **CSP / headers de segurança** (defesa contra XSS — ledger `seguranca-pendencias.md`):
  - **CSP por-request com nonce vive em `src/proxy.ts`** (Next 16 = `proxy.ts`, NÃO
    `middleware.ts` — os dois juntos quebram o build). PROD: `script-src 'self'
'nonce-…' 'strict-dynamic'`; DEV relaxa p/ `'unsafe-eval' 'unsafe-inline'` (HMR).
    O nonce flui `proxy` → header `x-nonce` → `layout.tsx` (`await headers()`) →
    `ThemeProvider nonce={…}` (next-themes injeta `<script>` inline). Headers estáticos
    (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS-só-prod) em
    `next.config.ts headers()`.
  - **Novo `<script>` inline próprio → passe o nonce** (`(await headers()).get('x-nonce')`),
    senão o `strict-dynamic` o bloqueia em prod (página/efeito quebra silenciosamente).
  - **Novo host externo chamado pelo BROWSER** (Supabase Storage, mapa, API 3ª-parte,
    fonte/CDN) → **adicione ao `connect-src`/`img-src`/`font-src`/`script-src` da CSP**
    em `proxy.ts`, senão a request é bloqueada. Hoje `connect-src` libera só `'self'` +
    ingest do Sentry.
  - **`style-src 'self' 'unsafe-inline'` é PROPOSITAL** (Radix/shadcn/next-font injetam
    `style=""` inline não-assinável). NÃO troque p/ nonce em style sem testar
    dropdown/dialog/popover/tema em navegador — quebra a UI. Assinar **script** (vetor
    real) é o que importa.
  - **Verificar CSP exige build de PROD** (`next start`), não `next dev` (a estrita só
    vale com `NODE_ENV=production`). O `npm run test:e2e` roda `next dev` → CSP relaxada;
    p/ exercitar a estrita, suba `next start` no `:3000` antes (Playwright reusa via
    `reuseExistingServer`).
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
  - `npm run rls:diag` / `rls:check` — provam que a RLS enforça (leitura/policy).
  - `npm run rls:check:write` (RLS barra escrita cross-clínica) · `rls:check:ext`
    (extensão real do app sob `enterClientScope`).
- Build/qualidade: `npm run build` · `npm run type-check` (`tsc --noEmit`) ·
  `npm run lint` · `npm test` (vitest).

## Ledgers (fonte da verdade de features grandes — `prompt/`)

- `reforma-relatorio.md` / `reforma-progresso.md` — divisão Admin × Clínica.
- `rls-gambiarra.md` — RLS: desenho, role restrito, footguns. **Ler antes de mexer em
  query/tenant/conexão/tabela com clientId.**
- `cargos-progresso.md` — cargos configuráveis + titularidade (Etapa 1), metas por
  usuário/cargo (Etapa 2), lacunas + visibilidade de dashboard por cargo (Etapa 3).
- `pipelines-progresso.md` — pipelines variáveis por clínica (≤6). Fase 1 (estrutura:
  modelo `Pipeline`+`PipelineKind`, etapas nativas, abas dinâmicas) FEITA; Fase 2 (efeitos
  das etapas nativas: agendar/comparecer/fechar/retroceder) FEITA. Itens 6/7: migração
  Fechado→Retenção (cron, dia seguinte), dedup comercial, conversão por `closedAt`, etapa
  "Cancelado" + `Client.noShowWindowHours`, `Patient.fromScheduledLead` — ver invariantes
  em "Convenções de código".
- `fase11-progresso.md` — infra de testes E2E.
- `auditoria-*.md`, `deploy-checklist.md` — achados de auditoria e checklist de deploy.
- `seguranca-pendencias.md` — pendências de segurança **OBRIGATÓRIAS** (rate-limiting
  login/webhook; segredo do webhook por-clínica/assinatura). Bloqueador de deploy das
  integrações reais. Hardening já feito; estes 2 mudam comportamento → aguardam decisão.
