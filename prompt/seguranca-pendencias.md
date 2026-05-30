# Segurança — Pendências OBRIGATÓRIAS (backlog)

> Origem: revisão de segurança (2026-05-30). Os 4 fixes de hardening já foram
> aplicados (escape de `href` no e-mail, `clientId` no `where` dos updates de
> insight, escape de senha no `rls-setup-role`, caps de tamanho no payload do
> webhook). **Os 2 itens abaixo mudam comportamento → ficaram pendentes para
> decisão e implementação. São OBRIGATÓRIOS antes de expor as integrações reais
> em produção.** Bloqueador de deploy — ver `deploy-checklist.md`.

## #1 — Rate-limiting (login + webhook) · OBRIGATÓRIA

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

## #2 — Modelo de segredo do webhook · OBRIGATÓRIA

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
