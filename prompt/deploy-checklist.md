# Deploy de Produção — Checklist (Fase 11, itens 3 e 7)

> O que sobra da Fase 11 exige **ação sua** (acesso ao Vercel, domínio, banco de
> prod). Aqui está a sequência. Lighthouse e o smoke final rodam contra a URL de
> prod (números de localhost não são representativos).

## 1. Variáveis de ambiente (Vercel → Project Settings → Environment Variables)

| Var                             | Valor                                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Pooled (transaction, 6543) **do role restrito** (ver §3) + `?pgbouncer=true`                                                                                                                                         |
| `DIRECT_URL`                    | Session pooler (5432) do **dono** (migrations)                                                                                                                                                                       |
| `NEXTAUTH_URL`                  | `https://<seu-dominio>`                                                                                                                                                                                              |
| `NEXTAUTH_SECRET`               | segredo forte (já existe em prod)                                                                                                                                                                                    |
| `AUTH_TRUST_HOST`               | `true` (se não-Vercel; no Vercel é dispensável)                                                                                                                                                                      |
| `RESEND_API_KEY` / `EMAIL_FROM` | credenciais reais de e-mail                                                                                                                                                                                          |
| `WEBHOOK_SECRET`                | ~~DEPRECADO~~ — não é mais lido. O webhook usa token **por-clínica** (`Client.webhookTokenHash`); o titular gera/rotaciona em `/configuracoes` e envia no header `x-webhook-secret`. Pode remover a env dos deploys. |
| `NEXT_PUBLIC_APP_URL`           | `https://<seu-dominio>`                                                                                                                                                                                              |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL do projeto Supabase — **necessária p/ o storage de documentos do card** (senão a aba Documentos mostra "não configurado"). Degrada graciosamente se ausente.                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service role do Supabase (server-only) p/ o storage de documentos. Criar tb o **bucket privado `client-documents`** no painel. Sem isso, documentos ficam desabilitados.                                             |

## 2. Migrations

```
npx prisma migrate deploy        # usa DIRECT_URL (dono). Aplica TODAS, incl. RLS.
```

## 3. Ligar a RLS em prod (ordem importa — ver `rls-gambiarra.md` §6)

1. **Deploy do código primeiro** (o extension de RLS + `enterClientScope` já estão no build).
2. **`migrate deploy`** (passo 2) — aplica a policy de RLS. Inócuo enquanto a app
   conectar como dono/BYPASSRLS.
3. **Criar o role restrito** em prod (equivalente ao `app_user`, **sem BYPASSRLS**,
   não-dono) e dar os GRANTs (ver `prisma/rls-setup-role.ts`).
4. **Trocar `DATABASE_URL`** para esse role (no pooled). Só aqui a RLS passa a valer.
   - Confirme antes: `SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user;`
     deve ser `false` no role da app.
5. Validar: `npm run rls:check` apontado para prod (cuidado: lê/escreve dado).

> Confirmado no Neon: o **pooler aceita o role restrito** e a RLS enforça (a app
> rodou os 11 E2E como `app_user` no pooled). Mesmo padrão vale p/ Supabase.

## 4. Domínio customizado

1. Vercel → Project → Domains → adicionar `<seu-dominio>`.
2. Apontar DNS (CNAME/A) conforme o Vercel indicar.
3. Atualizar `NEXTAUTH_URL` e `NEXT_PUBLIC_APP_URL` para o domínio final e redeploy.

## 5. Pós-deploy — auditorias (item 3)

- **Acessibilidade:** já validada localmente (axe, 0 violações serious/critical em
  login/privacidade/dashboard/pacientes — `e2e/a11y.spec.ts`). Re-rodar em prod é opcional.
- **Performance (Lighthouse > 90):** rodar contra a URL de prod (sem instalar nada):
  ```
  npx lighthouse https://<seu-dominio>/login --preset=desktop --view
  ```
  Repetir para as telas principais autenticadas (logado). Se algo < 90, atacar:
  imagens, JS não usado, fontes. (Localhost/dev não é representativo — o número
  que vale é o do deploy com CDN/compressão do Vercel.)
- **Smoke manual:** login admin → dashboard; login clínica → overview; criar
  atividade; ver notificação; isolamento (clínica A não vê dado da B).

## 6. Estado da app pré-deploy (verde)

- `tsc` 0 · `eslint src` 0 erros · `vitest` 131 · **E2E 11** (público + auth +
  isolamento de clínica + a11y) verdes contra o banco de teste (Neon).

## 7. Segurança — CONCLUÍDO (2026-06-01)

Ver `seguranca-pendencias.md` (detalhe). Os 2 bloqueadores foram resolvidos:

- **Rate-limiting** em `/login` e `POST /api/webhooks/*` — contador fixed-window no
  Postgres (tabela `RateLimit`, sem infra externa). Login: lockout por email+IP / IP,
  fail-open. Webhook: 429 + `Retry-After` por IP e por clínica.
- **Segredo do webhook por-clínica** — `Client.webhookTokenHash`; o token resolve o
  `clientId` server-side, o body não escreve mais lead em clínica arbitrária. Hook
  `verifyProviderSignature` pronto p/ HMAC por-provider quando os adapters reais entrarem.
- **Ação de deploy:** rodar a migration `20260601000000_security_rate_limit_webhook_token`
  (cria `RateLimit` + GRANT a `app_user` + `Client.webhookTokenHash`). Cada clínica gera o
  token em `/configuracoes` (titular). `WEBHOOK_SECRET` pode sair das envs.

## 8. Otimização pendente (medir antes de fazer)

- ~~**Índice das atividades (PERF-001·B)**~~ — **FEITO (2026-06-11), decisão por
  dado:** `EXPLAIN ANALYZE` em prod mostrou Seq Scan de **3.01s** na query de
  atrasadas (a de 24h já usava o índice de `dueDate`, 0.05s). Migration
  `20260611000000_activity_status_duedate_index` cria `[status, dueDate]`
  (status primeiro: `IN` de 2 valores + range). Aplica em prod no próximo build
  da Vercel. Paginação não foi necessária — o gargalo era só o scan.
