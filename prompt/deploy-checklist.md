# Deploy de Produção — Checklist (Fase 11, itens 3 e 7)

> O que sobra da Fase 11 exige **ação sua** (acesso ao Vercel, domínio, banco de
> prod). Aqui está a sequência. Lighthouse e o smoke final rodam contra a URL de
> prod (números de localhost não são representativos).

## 1. Variáveis de ambiente (Vercel → Project Settings → Environment Variables)

| Var                             | Valor                                                                                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Pooled (transaction, 6543) **do role restrito** (ver §3) + `?pgbouncer=true`                                                                                                                                                                                      |
| `DIRECT_URL`                    | Session pooler (5432) do **dono** (migrations)                                                                                                                                                                                                                    |
| `NEXTAUTH_URL`                  | `https://<seu-dominio>`                                                                                                                                                                                                                                           |
| `NEXTAUTH_SECRET`               | segredo forte (já existe em prod)                                                                                                                                                                                                                                 |
| `AUTH_TRUST_HOST`               | `true` (se não-Vercel; no Vercel é dispensável)                                                                                                                                                                                                                   |
| `RESEND_API_KEY` / `EMAIL_FROM` | credenciais reais de e-mail                                                                                                                                                                                                                                       |
| `WEBHOOK_SECRET`                | **setar antes de ligar integração** — o webhook é fail-closed: `POST /api/webhooks/*` responde **401** sem `WEBHOOK_SECRET` + header `x-webhook-secret` batendo. Mock hoje; ao ligar integração real, idealmente trocar por validação de assinatura por provider. |
| `NEXT_PUBLIC_APP_URL`           | `https://<seu-dominio>`                                                                                                                                                                                                                                           |

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

## 7. Otimização pendente (medir antes de fazer)

- **Índice das atividades (PERF-001·B):** os crons `findDue/OverdueActivities`
  varrem a tabela filtrando só `status`+`dueDate` (ambos domínios). Os crons já
  logam `durationMs`. Se a medição em prod justificar, criar índice
  `[status, dueDate]` (ou `[domain, status, dueDate]`) + paginação por clínica.
  Não é bloqueador; decisão por dado, não por suposição.
