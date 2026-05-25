# Fase 11 — Polimento + Testes + Deploy final — Progresso

> Ledger multi-sessão da Fase 11 do [`prompt.Md`](./prompt.Md) (SEÇÃO 14).
> Aceite global: sistema usável por usuários reais, cumpre tudo do prompt.
> Contexto: reforma divisão + auditoria de hardening já fechadas (ver
> `reforma-relatorio.md`). Branch atual já tem `(client)`→`(clinic)`.

## Restrições do ambiente (herdadas)

- **`.env` aponta produção** (Accelerate/Vercel), **sem dev DB**. Verificação local = `tsc`/`eslint`/`vitest` (mock). Migrations as aplica o usuário (`prisma migrate deploy`).
- Runtime nunca testado localmente → E2E e Lighthouse precisam de ambiente rodando (DB real ou preview).

> **STATUS GERAL (2026-05-22):** Fase 11 **EM PRODUÇÃO**. Itens 1-6 concluídos;
> item 7 deployado (Supabase prod: 16 migrations aplicadas do zero, `app_user`
> sem BYPASSRLS como runtime → RLS enforçando; branch mergeada → Vercel). Só falta
> opcional: domínio customizado, Lighthouse na URL de prod, smoke manual.
> App: tsc 0 · eslint 0 · vitest 131 · E2E 11. RLS validada local (Neon) e prod.

## Decisões pendentes (bloqueiam itens)

| #   | Decisão                                  | Bloqueia     | Status                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Modelo de RLS**                        | RLS Supabase | **RESOLVIDA:** Opção 1 (GUC via AsyncLocalStorage + extension Prisma). Confirmado que trocar Accelerate→pooler não tem perda funcional (cache não usado). Construída e validada no Neon. **Descoberta na validação:** RLS exige role de conexão SEM `BYPASSRLS` (o dono ignora policies). Detalhes em [`rls-gambiarra.md`](./rls-gambiarra.md). |
| D2  | **Ambiente p/ E2E**                      | E2E run      | **RESOLVIDA (2026-05-22):** banco **Neon** descartável. `.env.test` (gitignored) com pooled+direct do Neon. 15 migrations + seed aplicados (admin@apice.dev/admin123). Falta só `npx playwright install` (browsers).                                                                                                                            |
| D3  | **Domínio de produção** (custom domain). | Deploy final | **ABERTA (input do usuário)** — passos em `deploy-checklist.md` §4.                                                                                                                                                                                                                                                                             |

## Status por item

| #   | Item (prompt §14, Fase 11)                      | Status                        | Sessão          | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------- | ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Testes unit dos services críticos               | CONCLUÍDA                     | S1 (2026-05-22) | Baseline 128 já cobria kpi/insights/jobs/lib + 21 de isolamento. Adicionado `notifications-job.test.ts` (domainRouting, 3 testes) — lacuna de segurança da Fase 8. **131 testes / 14 arquivos verdes.**                                                                                                                                                                                                                                    |
| 2   | E2E Playwright dos fluxos principais            | CONCLUÍDA                     | S2 (2026-05-22) | **7 testes verdes contra Neon** (`npm run test:e2e`): públicas (privacidade/link/cookie), auth admin (login→/dashboard, senha errada), e **isolamento de clínica na UI** (owner A só vê Paciente Alpha; owner B só Bravo). Dev mode + workers:1 (evita timeout de compile). Seed `seed-e2e.ts` (2 clínicas+owners+pacientes). Bug real corrigido no caminho: `/privacidade` estava barrada pelo `proxy.ts` → adicionada a `PUBLIC_ROUTES`. |
| 3   | Performance (Lighthouse) + Acessibilidade audit | A11Y CONCLUÍDA · PERF p/ prod | S3 (2026-05-22) | **A11y runtime (axe):** `e2e/a11y.spec.ts` varre login/privacidade/dashboard/pacientes, **0 violações serious/critical**. Corrigido: muted-foreground (40%) e **cor da marca escurecida p/ AA** (`--primary` → `161 94% 24%`, branco passa 4.5:1) — decisão do usuário. **Lighthouse:** roda contra a URL de prod (`npx lighthouse`), ver `deploy-checklist.md` §5 (localhost não é representativo).                                       |
| 4   | Acessibilidade audit                            | CONCLUÍDA                     | S1 (2026-05-22) | `eslint-plugin-jsx-a11y` ligado (recommended). 15 erros triados: labels do audit/preferences associados (fix real); cards dnd e `no-autofocus`/`heading-has-content` documentados (exceções justificadas). eslint `src` = 0 erros (5 warnings pré-existentes).                                                                                                                                                                             |
| 5   | LGPD: política + consentimento cookies          | CONCLUÍDA (código)            | S1 (2026-05-22) | `src/app/privacidade/page.tsx` (LGPD+cookies, pt-BR), `components/cookie-consent.tsx` (banner essencial, localStorage), montado no root layout + link no `(auth)/layout`. tsc/eslint verde. **TODO usuário:** preencher CNPJ/DPO na seção 1.                                                                                                                                                                                               |
| 6   | RLS Supabase ativado e validado                 | CONCLUÍDA (validada no Neon)  | S3 (2026-05-22) | Opção 1 (ALS+extension+GUC) construída e **provada no banco**: `rls:check` mostra `findMany()` sem `where` só retorna a clínica da GUC. Migration `20260522000000_rls_tenant_isolation` (18 tabelas, FORCE RLS + policy `NULLIF`). Doc completa em [`rls-gambiarra.md`](./rls-gambiarra.md). **PROD pendente:** deploy do código → migration → criar role restrito + trocar DATABASE_URL (§6 do doc).                                      |
| 7   | Deploy produção + custom domain                 | DEPLOYADO                     | S3 (2026-05-22) | Prod Supabase: schema aplicado do zero (16 migrations — projeto estava vazio; `_prisma_migrations`/`public` resetados), `app_user` criado + `DATABASE_URL` trocado (RLS ativa), branch mergeada → Vercel. **Pendente opcional:** custom domain, Lighthouse na URL de prod, smoke manual.                                                                                                                                                   |

## Ordem de execução (autônomo primeiro)

1. **LGPD (item 5)** — política de privacidade + cookie consent. Sem dep externa.
2. **A11y (item 4)** — plugin jsx-a11y + correções. Sem dep externa.
3. **Testes unit (item 1)** — fechar lacunas de cobertura dos services críticos.
4. **E2E scaffold (item 2)** — Playwright config + specs (run fica pra D2).
5. **RLS (item 6)** — após D1.
6. **Lighthouse/deploy (3,7)** — após ambiente/domínio (D2/D3).

## Relatórios de sessão

<!-- append-only, mais recente embaixo -->

### S1 (2026-05-22) — itens autônomos (LGPD, a11y, testes, scaffold E2E)

**Feito (tudo aditivo, tsc/eslint/vitest verdes):**

- **LGPD (item 5):** `src/app/privacidade/page.tsx` (política pt-BR cobrindo dados/base legal/cookies/retenção/direitos art.18), `src/components/cookie-consent.tsx` (banner de cookie essencial, aceite em localStorage versionado), montado no root layout + link no `(auth)/layout`. **TODO usuário:** preencher CNPJ/contato do DPO na seção 1 da política.
- **A11y (item 4):** `eslint-plugin-jsx-a11y` (recommended) ligado em `eslint.config.mjs`. Correções reais: labels de filtro do `audit-log-table` associados via `htmlFor`/`id`; radio-card do `service-preferences-form` com `aria-label`. Exceções documentadas: `no-autofocus` off (autofocus só em campos de Dialog Radix com focus-trap); `heading-has-content` disable no `card.tsx` (children via props); cards dnd-kit (`lead-card`/`deal-card`) disable de click/static-interaction (teclado é do sensor dnd; Space=pegar conflita com handler de abrir).
- **Testes (item 1):** exportado `domainRouting` em `notifications-job.ts` + `notifications-job.test.ts` (3 testes de isolamento de roteamento). Total 131/14.
- **E2E scaffold (item 2):** `playwright.config.ts` (webServer desligado por padrão p/ não tocar prod; baseURL via `E2E_BASE_URL`), `e2e/public.spec.ts` (privacidade + login + banner de cookies — rotas públicas), script `test:e2e`. Browsers NÃO baixados (`npx playwright install` fica p/ o usuário).

**Verificação:** `npx tsc --noEmit` verde; `eslint src` 0 erros; `vitest run` 131 passed (14 files). Runtime/E2E não executados (sem DB de teste — D2).

**Bloqueado, aguarda decisão:** item 6 (RLS → D1), item 3 (Lighthouse → ambiente), item 7 (deploy → D3 + ação Vercel), specs E2E autenticados (→ D2).

### S2 (2026-05-22) — E2E rodando de verdade (Neon)

**Feito:**

- **Banco de teste Neon** (descartável). `.env.test` (gitignored, com `AUTH_TRUST_HOST=true`), `dotenv-cli`, scripts `migrate:test`/`seed:test`/`test:e2e`. 15 migrations + seed aplicados.
- **Seed E2E** (`prisma/seed-e2e.ts`): org + admin/staff + 2 clínicas (Alpha/Bravo) com owners (owner-a/owner-b @apice.dev / owner123) e um paciente em cada — base do teste de isolamento.
- **Specs:** `public.spec` (privacidade/link/cookie), `auth.spec` (login admin→/dashboard, senha errada), `clinic-isolation.spec` (owner A só vê Paciente Alpha; B só Bravo). **7 verdes.**
- **Config:** dev mode + `workers:1` + `fullyParallel:false` + timeouts 30s (evita timeout de compile sob demanda do `next dev`; prod build quebra cookie Secure/host em http://localhost).
- **Bug real corrigido:** `/privacidade` estava barrada pelo `proxy.ts` (Next 16 = middleware) → adicionada a `PUBLIC_ROUTES`. A página tem que ser pública (rodapé do login/banner linkam pré-auth).

**Aprendizados (p/ quem rodar):** E2E roda em **dev** apontado pro Neon via `npm run test:e2e`. NextAuth v5 em build de produção exige `AUTH_TRUST_HOST` + HTTPS (cookie Secure) — por isso dev. `package.json#prisma` dá warning de deprecação (Prisma 7) — não-bloqueante.

**Verificação:** tsc 0 · eslint 0 erros (5 warnings pré-existentes) · vitest 131 · **E2E 7 passed**.

### S3 (2026-05-22) — RLS (defesa em profundidade) + a11y runtime

**RLS (item 6) — construída e VALIDADA no Neon:**

- `src/server/tenant/client-scope.ts` (AsyncLocalStorage do `clientId`), extensão no
  `src/lib/prisma.ts` (injeta `SET app.current_client_id` via array-`$transaction`),
  `getClinicContext` chama `enterClientScope`. Migration `20260522000000_rls_tenant_isolation`
  (18 tabelas, ENABLE+FORCE RLS + policy com `NULLIF`).
- **Validação empírica** (`npm run rls:check`): `findMany()` SEM `where` só retorna a
  clínica da GUC; admin (GUC vazia) vê tudo. E2E inteira rodou com a app conectada como
  `app_user` (sem BYPASSRLS) no pooled — RLS enforçando de verdade.
- **2 bugs achados na validação:** (1) role dono tem `BYPASSRLS` → ignora RLS; precisa
  role restrito (descoberta-chave); (2) GUC reverte p/ `''` (não NULL) após `set_config`
  local → policy precisa `NULLIF(...,'')` senão admin quebra. Ambos corrigidos.
- Doc completa: [`rls-gambiarra.md`](./rls-gambiarra.md). Utilitários: `rls:check`,
  `rls:diag`, `rls:setup-role`.

**A11y runtime (item 3) — axe, verde:**

- `e2e/a11y.spec.ts` (axe-core/playwright) varre 4 páginas → 0 violações serious/critical.
- Contraste corrigido: `--muted-foreground` 46.1%→40%; `--primary` escurecido
  (`160 84% 39%`→`161 94% 24%`) p/ branco passar AA 4.5:1 (decisão do usuário).

**Deploy (item 7):** [`deploy-checklist.md`](./deploy-checklist.md) — env vars, rollout RLS, domínio, Lighthouse. Ação do usuário.

**Verificação final:** tsc 0 · eslint 0 erros · vitest 131 · **E2E 11** (público + auth + isolamento + a11y), tudo contra Neon.
