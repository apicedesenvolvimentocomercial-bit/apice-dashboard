# Segurança — Pendências OBRIGATÓRIAS (backlog)

> Origem: revisão de segurança (2026-05-30). Os 4 fixes de hardening já foram
> aplicados (escape de `href` no e-mail, `clientId` no `where` dos updates de
> insight, escape de senha no `rls-setup-role`, caps de tamanho no payload do
> webhook). **Os 2 itens OBRIGATÓRIOS (rate-limiting + segredo do webhook) foram
> CONCLUÍDOS em 2026-06-01 — ver seção "Concluído". Não há mais bloqueador de
> deploy de segurança aqui.**

## Concluído

### #4 — Revogação de sessão JWT + hardening de sessão (2026-07-10) ✅

Perguntas do dono (token no GET? sessão invalidada? logout revoga?) → auditoria +
correção. Achado central: JWT é stateless, então logout só limpava o cookie do
navegador; um token já emitido (roubado/copiado) seguia válido até o `maxAge` de
30d. Confirmado OK antes do fix: o token NÃO trafega em URL/GET (cookie httpOnly,
`sameSite=lax`, `secure` em prod), nenhum POST manda segredo por query param
(webhook usa header `x-webhook-secret`, cron usa `Authorization`).

**Fix — `User.sessionVersion` (revogação stateless):** o claim viaja no token;
`getTenantContext` compara com o valor FRESCO do DB e nega o acesso a dados no
PRÓXIMO request se divergir (o re-sync do jwt callback também mata token/página em
≤10 min — mesmo modelo de duas camadas do #3). Incrementar o version invalida
TODAS as sessões do usuário na hora. Ganchos: **logout** (`logoutAction` antes do
`signOut` do cookie → "sair" é global/todos os dispositivos), **troca**
(`changePasswordAction`, form força novo login) e **reset** de senha. `maxAge`
reduzido 30d→7d (+`updateAge` 24h). Migration `20260710000000_user_session_version`.
Cobertura em `context.test.ts` (version mismatch → UnauthorizedError). **Limitação
aceita:** revogação por-dispositivo (logout só deste navegador, mantendo os outros)
exigiria denylist de `jti` — não implementado; hoje o logout é global.

### #3 — Auditoria do sistema de usuários (2026-06-10) ✅ — 2 críticos achados e CORRIGIDOS

Auditoria completa de enforcement (actions/queries/pages/rotas), conformidade com
os ledgers de cargos e ciclo de vida de usuário. Enforcement: limpo (105+ actions
com `assertCan`, 12/12 pages de clínica gateadas, admin gateado por aba OU query).
Dois furos reais no CICLO DE VIDA, ambos corrigidos no mesmo dia:

- **Crítico 1 — usuário removido/desativado mantinha acesso até o cookie expirar.**
  Estratégia JWT: apagar `Session` do banco não revoga nada, e nem o re-sync de
  10min nem `getTenantContext` checavam `isActive`/`deletedAt` (repro real do
  usuário: email já removido seguia acessando o painel da consultoria). **Fix
  (duas camadas):** `getTenantContext` agora lê o usuário FRESCO do DB por request
  (`cache()` do React deduplica) e lança `UnauthorizedError` se inativo/deletado —
  os claims de autorização (role/clientId/clinicRoleId) saem do DB, o JWT só
  identifica o `userId`; e o re-sync do token (`config.ts`) retorna `null`
  (destrói a sessão) quando o usuário sumiu/desativou. Bônus: a janela de 10min
  p/ mudança de role/cargo morreu junto na camada de dados.
- **Crítico 2 — titular da clínica removível por `staff:write`.**
  `removeClinicUserAction` não comparava o alvo com `Client.ownerId` (o espelho
  da agência em `staff-actions.ts` tinha a guarda; o da clínica não). **Fix:**
  `ForbiddenError` se o alvo é o titular — exige transferir a titularidade antes.

Limitação conhecida que PERMANECE (aceita): páginas renderizadas (RSC) fora da
camada de dados podem ver claims de até 10min atrás no token — mas toda leitura/
mutação de dado passa por `getTenantContext`/`can()`, que agora são frescos.

### #1 — Rate-limiting (login + webhook) (2026-06-01) ✅ — opção (a) Postgres

Throttle persistido no Postgres, **sem infra nova** (decisão: opção a — a stack é
Vercel + Supabase, sem Redis).

- **Modelo `RateLimit`** (`key` PK, `count`, `expiresAt`) — infra GLOBAL, **sem
  `clientId` → FORA da RLS** de propósito (login/webhook rodam sem escopo de
  clínica). Migration `20260601000000_security_rate_limit_webhook_token` (+ GRANT
  guardado a `app_user`, pois o login DEPENDE da tabela).
- **Limiter** em [`src/server/security/rate-limit.ts`](../src/server/security/rate-limit.ts):
  `consumeRateLimit` é ATÔMICO (`INSERT ... ON CONFLICT` num só statement → conta
  certo sob rajada concorrente, não vaza tentativa). `peekRateLimit` (pré-check sem
  incrementar) e `resetRateLimit`.
- **Login** ([`config.ts` `authorize`](../src/server/auth/config.ts)) via
  [`login-throttle.ts`](../src/server/security/login-throttle.ts): dois eixos —
  `email+IP` (5/15min) e `IP` (30/15min). Lockout ANTES do bcrypt (poupa CPU);
  conta falhas (email inexistente conta igual → **não enumera usuário**, resposta
  constante "inválido"); sucesso limpa o lockout da conta. **FAIL-OPEN:** erro do
  limiter não tranca o login (um limiter quebrado não derruba o acesso de todos).
- **Webhook** ([`route.ts`](../src/app/api/webhooks/[provider]/route.ts)): flood-guard
  por IP (60/min) e por clínica (120/min) → `429` + header `Retry-After`.
- IP extraído de `x-forwarded-for`/`x-real-ip` ([`request-ip.ts`](../src/lib/request-ip.ts)).
- **Testes:** `rate-limit.test.ts` + `login-throttle.test.ts` (chaves, thresholds,
  fail-open). Migration aplicada no Neon + provado que `app_user` lê/escreve a tabela.

### #1b — Rate-limiting de MUTAÇÕES autenticadas + exports (2026-07-17) ✅

Complemento anti-DoS por **VOLUME**: os tetos de tamanho (bodySizeLimit, `.max()`
do zod, broadcast-guard) limitam UM request, mas um usuário autenticado podia
scriptar milhares de requests pequenos (curl + cookie) e afogar a fila de conexões
do Postgres. Sobre o mesmo limiter Postgres (#1), agora em
[`mutation-throttle.ts`](../src/server/security/mutation-throttle.ts):

- **Orçamento de ESCRITA por usuário** — janela dupla: rajada **120/min** +
  sustentado **2000/h** (inalcançável à mão; trivial de estourar por script).
  Estourou → `TooManyRequestsError` (`RATE_LIMITED`, 429) → `fail()` amigável via
  `runAction`. **FAIL-OPEN** (política igual ao login/reset).
- **Enforcement no CHOKEPOINT [`assertCan`](../src/server/auth/assert-can.ts):**
  toda ação `write`/`delete`/`assignToOthers` consome o orçamento ANTES de resolver
  a permissão — cobre atividades, agendamentos, eventos de calendário, leads/kanban
  (mover/criar/etapas/pipelines), pacientes, receitas/custos/ativos/recebíveis,
  metas, insights (ciclo reconhecer/dispensar/reabrir), procedimentos, configurações,
  staff, holidays, templates de mensagem, docs/notas — e qualquer action futura que
  passe pelo gate. `read`/`viewAll` ficam FORA (SSR/busca/filtros livres).
- **Mutações sem `assertCan`** chamam `assertMutationBudget` explícito: cargos
  (`assertCanManageRoles` clínica/agência), transferência de titularidade (org e
  clínica), notificações (marcar lida/excluir, admin e clínica), preferências.
- **Exports** (`/api/export/**` + `/api/reports/**/pdf`): leitura pesada + arquivo
  em memória → orçamento próprio por usuário (**15/min + 100/h**, bucket único p/
  CSV/XLSX/PDF) → **429 + `Retry-After`**.
- **Recálculo de insights**: teto extra POR CLÍNICA (**5/5min**) — o botão roda o
  engine inteiro. Cron diário não passa por aqui (jobs não usam `assertCan`).
- **Testes:** `mutation-throttle.test.ts` (janela dupla, chaves, fail-open) +
  `assert-can.test.ts` (consome só em mutação; 429 antes da permissão).
- Fora de escopo (aceito por ora): `logoutAction` (1 update na própria linha,
  throttle quebraria a semântica de logout), `getDreReportAction` (leitura;
  bloquear filtros legítimos custa mais que o risco), `acceptInviteAction`
  (não autenticada, mas token-gated com lookup barato — candidata a throttle
  por IP se virar alvo).

### #2 — Modelo de segredo do webhook (2026-06-01) ✅ — opção híbrida (token + hook de assinatura)

Token **por-clínica** agora (isola de verdade, implementável sem adapter real) +
**ponto de extensão** pronto p/ assinatura por-provider quando os adapters reais
entrarem.

- **`Client.webhookTokenHash`** (`@unique`, sha256 hex) na mesma migration. O token
  cru (256 bits) é mostrado UMA vez ao titular; só o hash fica no banco.
- **Resolução server-side** ([`route.ts`](../src/app/api/webhooks/[provider]/route.ts)):
  o token chega no header `x-webhook-secret`, hasheamos e achamos a clínica pelo
  índice único → **o body NÃO decide mais o `clientId`** (acabou o write cross-tenant
  com o segredo global). `ingestLead(provider, clientId, payload)` recebe o `clientId`
  RESOLVIDO; o `clientId` saiu do `ingestSchema` (ignorado se vier no body).
- **Hook de assinatura** ([`webhook-signature.ts`](../src/server/services/webhook-signature.ts)):
  `verifyProviderSignature()` hoje é stub (`true`); doc explica como plugar o HMAC
  por provider (Meta `x-hub-signature-256` etc.). **Assinatura é GRÁTIS** (HMAC com o
  app secret do painel do provider), mas prova ORIGEM, não TENANT — por isso o token
  por-clínica continua sendo quem amarra a requisição à clínica.
- **UI** ([`webhook-token-card.tsx`](../src/components/clinic/settings/webhook-token-card.tsx)
  em `/configuracoes`, só o titular): gerar/rotacionar (revela o token 1x) + revogar +
  endpoints prontos p/ copiar. Actions `rotateWebhookTokenAction`/`revokeWebhookTokenAction`
  ([`settings-actions.ts`](../src/server/actions/settings-actions.ts), gate `isOwner`).
- **`WEBHOOK_SECRET` global DEPRECADO** (não é mais lido; comentário em `env.ts`).
- **Teste de isolamento:** `lead-ingest.test.ts` prova que o lead grava na clínica
  resolvida e que um `clientId` injetado no body é ignorado.

### CSP + headers de segurança (2026-05-30) ✅

### CSP + headers de segurança (2026-05-30) ✅

Defesa de profundidade contra XSS, decidido na fase pre-MVP (opção c: CSP
enforçada com nonce, não só Report-Only).

- **CSP por-request com nonce** em [`src/proxy.ts`](../src/proxy.ts) (Next 16 usa
  `proxy.ts`, não `middleware.ts`). PROD: `script-src 'self' 'nonce-…'
'strict-dynamic'`. DEV: relaxa p/ `'unsafe-eval' 'unsafe-inline'` (HMR usa eval).
  O nonce é fiado ao next-themes via `headers()` no [`layout.tsx`](../src/app/layout.tsx)
  → [`theme-provider.tsx`](../src/components/providers/theme-provider.tsx) (prop `nonce`).
- **`style-src 'self' 'unsafe-inline'`** de propósito: Radix/shadcn/next-font
  injetam atributo `style` inline não-assinável. Assinar **script** (vetor real de
  XSS) é o que importa; XSS via estilo é risco baixo. **Não troque p/ nonce em
  style sem antes testar dropdowns/dialogs/tema** — quebra a UI.
- **`connect-src`** libera ingest do Sentry. Se entrar outro host externo no
  browser (ex.: Supabase Storage, mapa), adicione aqui senão a request é bloqueada.
- **Headers estáticos** em [`next.config.ts`](../next.config.ts): `X-Frame-Options:
DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  e `Strict-Transport-Security` (só em produção).
- Verificado em build de PROD (`next start`) + navegador real (Playwright/Chromium):
  header CSP presente, 23/23 scripts executáveis com nonce (0 sem), incl. o inline do
  next-themes. **E2E contra a CSP estrita: 8 fluxos passaram** (login via server action,
  dashboard autenticado, dialog Radix de cookies renderizado, isolamento de clínica) —
  prova que CSS/Radix/tema/server-actions funcionam sob `strict-dynamic`. Nenhuma quebra
  atribuível à CSP.

## Achados pré-existentes (surgiram no E2E, NÃO causados pela CSP)

### PDF de relatório retornava 500 em cross-tenant — CORRIGIDO ✅

`api/reports/[clientId]/pdf/route.ts` tinha `catch` que mascarava `ForbiddenError`
como **500**. Agora mapeia → **403** (igual à rota de export). E2E de isolamento
verde. (Belt de tenant nunca falhou — só o status HTTP estava errado.)

### a11y: contraste do dourado < WCAG AA — CORRIGIDO ✅ (opção b, dois tons)

Eram DOIS problemas de contraste com o dourado da marca, ambos resolvidos em
`globals.css` (mantendo o dourado vivo — decisão do usuário):

1. **Botão** (`bg-primary` dourado vivo + texto branco) = 3.6:1 → agora **texto
   escuro** (`--primary-foreground: 225 11% 7%` no light, espelhando o dark) ≈ 4.9:1.
   `--fc-button-text-color` idem p/ os botões do FullCalendar.
2. **Dourado como TEXTO** (`text-primary`: link, logo "Senno", nav ativo) sobre fundo
   claro = 3.2–3.6:1 → criado **`--primary-text`** (dourado mais escuro `42 53% 33%`
   no light; `== --primary` no dark) + override `.text-primary { color: hsl(var(--primary-text)) }`
   no fim de `globals.css`. `bg-primary`/marca seguem o vivo. **Dois tons de dourado:
   vivo p/ superfície, escuro p/ texto.** Convenção no CLAUDE.md (seção Cores).

Verificado: `e2e/a11y.spec.ts` 4/4 verde + suíte completa **13/13**.
