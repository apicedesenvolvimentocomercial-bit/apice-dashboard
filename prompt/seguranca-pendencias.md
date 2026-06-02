# Segurança — Pendências OBRIGATÓRIAS (backlog)

> Origem: revisão de segurança (2026-05-30). Os 4 fixes de hardening já foram
> aplicados (escape de `href` no e-mail, `clientId` no `where` dos updates de
> insight, escape de senha no `rls-setup-role`, caps de tamanho no payload do
> webhook).
>
> **STATUS (2026-06-01): AMBAS RESOLVIDAS E IMPLEMENTADAS.** #1 (rate-limiting) e #2
> (segredo do webhook por-clínica) foram implementados — ver "Concluído" abaixo. As
> seções de decisão ficam como histórico. Não são mais bloqueadores de deploy.

## #1 — Rate-limiting (login + webhook) · ✅ RESOLVIDA (2026-06-01)

> Implementada com a opção **a)** (contador em Postgres — sem infra nova) cobrindo
> **login E webhook**. Detalhe no "Concluído". O texto abaixo é o histórico da decisão.

**Risco:** sem throttle. `/login` (NextAuth `authorize`) aceita tentativas
ilimitadas → brute-force de senha. `POST /api/webhooks/*` idem → flooding de
leads inflando pipeline/custo de DB. (Grep `rate` hoje só acha retry de e-mail
no Resend, não throttle de request.)

**Por que ficou pendente:** adicionar throttle **bloqueia** requisições acima de
N por janela (pode afetar usuário legítimo atrás de NAT) e **exige infra**
(Redis/Upstash ou contador em tabela no Postgres).

**Opções (decidir):**

- **a)** Contador em tabela Postgres — sem infra nova; lockout de login após N
  falhas por email/IP numa janela. Mais simples.
- **b)** `@upstash/ratelimit` + Redis — robusto/distribuído; exige conta + envs.
- **c)** Faseado: só `/login` agora (risco maior é brute-force), webhook depois.

**Aceite:** N falhas de login na janela → 429/lockout temporário (constante no
tempo, sem vazar se o email existe); webhook acima do teto → 429. Cobrir com teste.

## #2 — Modelo de segredo do webhook · ✅ RESOLVIDA (2026-06-01)

> Implementada com a opção **a)** (token POR-CLÍNICA — o token resolve o clientId
> server-side; o body não escolhe mais a clínica). Detalhe no "Concluído". Texto
> abaixo = histórico da decisão.

**Risco:** hoje há **um** `WEBHOOK_SECRET` global e o `clientId` vem no body —
quem tiver o segredo grava `Lead` em **qualquer clínica de qualquer org**
(`api/webhooks/[provider]/route.ts` → `ingestLead`; `assertClientAccess` NÃO roda
aqui, é endpoint sem sessão). Aceitável **só** enquanto é mock/sem adapter real.

**Por que ficou pendente:** muda o contrato de integração (como o provider
autentica e como o `clientId` é resolvido).

**Opções (decidir):**

- **a)** Segredo **por-clínica**: cada clínica tem seu token; o token resolve o
  `clientId` server-side — o body não escolhe mais a clínica. Isola de verdade.
- **b)** Assinatura real por-provider (Meta `X-Hub-Signature-256`, WhatsApp,
  Google) validada ANTES de processar. Correto a longo prazo; mais trabalho;
  depende de plugar os adapters reais. (Já é TODO no `route.ts`.)
- **c)** Manter global enquanto não houver adapter real plugado (estado atual).

**Aceite:** body não decide mais o `clientId` cross-tenant; o token/assinatura
amarra a requisição à clínica/provider. Cobrir com teste de isolamento.

## Concluído

### #1 — Rate-limiting (login + webhook) (2026-06-01) ✅

Contador de janela fixa em Postgres — opção a) (sem Redis/infra nova).

- **Model `RateLimit`** (`key` PK, `count`, `windowStart`, `blockedUntil`, `updatedAt`) +
  migration `20260601110000_security_rate_limit_webhook_token`. Tabela global (sem
  `clientId`) → fora da RLS. Aplicada no Neon.
- **Helper** [`src/server/security/rate-limit.ts`](../src/server/security/rate-limit.ts):
  `isRateLimited` (peek), `registerHit` (conta + bloqueia ao estourar), `clearRateLimit`,
  `clientIpFromHeaders`. Configs: `LOGIN_RATE_LIMIT` (8 falhas/15min → trava 15min),
  `WEBHOOK_RATE_LIMIT` (60 req/min por IP → trava 5min).
- **Login** (`auth/config.ts authorize`): bloqueia por **email E IP**; falha conta hit,
  sucesso limpa as chaves. Resposta de falha idêntica com/sem bloqueio (retorna `null`)
  → não vaza se o email existe nem quanto falta (constante no tempo). Lê o IP do `request`.
- **Webhook** (`api/webhooks/[provider]`): `registerHit('webhook:ip:<ip>')` antes do
  trabalho de DB → **429 + Retry-After** quando estoura.
- **Testes:** `src/server/security/rate-limit.test.ts` (6: teto, bloqueio, peek, reset de
  janela, bloqueio persistente, clear).

### #2 — Segredo do webhook por-clínica (2026-06-01) ✅

Token POR-CLÍNICA — opção a). O body não escolhe mais a clínica.

- **`Client.webhookTokenHash`** (`@unique`, só o hash sha256) na mesma migration.
- **Serviço** [`src/server/services/webhook-auth.ts`](../src/server/services/webhook-auth.ts):
  `generateWebhookToken` (cru + hash), `hashWebhookToken`, `resolveClientIdByWebhookToken`
  (lookup por hash; null se ausente/clínica deletada).
- **Rota** reescrita: header `x-webhook-token` resolve o `clientId` server-side; sem token
  válido → **401**. `WEBHOOK_SECRET` global REMOVIDO do `env.ts` (não é mais usado).
- **Actions** [`webhook-actions.ts`](../src/server/actions/webhook-actions.ts):
  `regenerateWebhookTokenAction` / `revokeWebhookTokenAction` (só TITULAR; token cru
  mostrado UMA vez). **UI** em `/configuracoes` (`modules/settings/webhook-settings.tsx`):
  URLs por provider + gerar/regenerar/revogar.
- **Testes:** `src/server/services/webhook-auth.test.ts` (6: hash determinístico, token↔hash,
  resolve válido, token desconhecido/vazio, clínica deletada).

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
