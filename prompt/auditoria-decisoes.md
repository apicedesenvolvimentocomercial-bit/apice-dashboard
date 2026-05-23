# Auditoria — Mesa de Decisões

## 🚀 Implementação (2026-05-22) — branch `feat/auditoria-hardening-divisao-c`

Todos os PRs executados na ordem recomendada. `tsc` limpo, `eslint` limpo, **128/128 testes**.

- **PR1 — hardening** (`8071d28`): SEC-001 (`assertClientAccess` nas read-queries), SEC-002
  (escopo de org no `getPipeline` via relação `client`), SEC-004 (`assertCan(read)` nas queries
  legadas + agregados org-wide gateados em `clients:read`), SEC-003·B (webhook fail-closed),
  BUG-001 (export 403/400/500 + datas), SEC-005 (log de contagem), PERF-001 (durationMs nos crons).
- **PR2–9 — divisão híbrida C** (incremental, PII primeiro): portas de domínio em
  `src/domains/clinic/{patients,appointments,financial,procedures,crm,goals,insights,dashboard}`
  que derivam `clientId` de `getClinicContext()` e reusam o cálculo compartilhado. As 8 telas
  `(client)/*` não passam mais `clientId`.

> **⚠️ Ação operacional (SEC-003·B):** o webhook agora é **fail-closed** — `POST /api/webhooks/*`
> responde **401** a menos que a env `WEBHOOK_SECRET` esteja setada E o header `x-webhook-secret`
> bata. Como os providers ainda são mock, nada quebra hoje; ao ligar integração real, setar
> `WEBHOOK_SECRET` em prod e, idealmente, trocar por validação de assinatura por provider.

> **Pendente (fora do escopo destes PRs):** PERF-001·B (índice `[status,dueDate]` — depende de
> medição em prod via os novos logs `durationMs`); rename `(client)`→`(clinic)` (cosmético).

---

## ✅ Decisões finais (2026-05-22)

| Achado   | Decisão                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| CPLX-001 | **C — híbrido** (isolar acesso por `getClinicContext`, compartilhar cálculo). Execução **incremental, PII primeiro**. |
| SEC-001  | **A** — `assertClientAccess` nas read-queries (hardening imediato; clínica também ganha porta via C).                 |
| SEC-002  | **A** — add `organizationId` no `getPipeline`.                                                                        |
| SEC-004  | **A** — `assertCan(read)` nas queries legadas (leitura controlada de verdade).                                        |
| SEC-003  | **B** — fechar a porta do webhook agora (401 sem assinatura/segredo); integração vem em breve.                        |
| PERF-001 | **A** — instrumentar/medir agora; índice (B) depois, se a medição justificar.                                         |
| BUG-001  | **A** — status code certo + validar datas no export.                                                                  |
| SEC-005  | **A** — logar contagem em vez de e-mails.                                                                             |

**Confirmado por código:** notificação de insight da clínica já NÃO chega ao admin
(`getRecipientsForClient` exclui ADMINs — `notification-service.ts:162`). Admin mantém visão
total da clínica nas duas abordagens; o híbrido só fortalece a barreira e prepara divergência futura.

**Plano de execução:** ver Seção 6 deste doc + ordem incremental do C abaixo.

---

Para cada problema do [`auditoria-relatorio.md`](./auditoria-relatorio.md): alternativas reais,
o que cada uma muda no **produto** (não só no código), esforço e risco. Marcado 👉 a recomendação.
Nada foi implementado — este doc existe para você escolher.

> **Fork estratégico primeiro:** a decisão de CPLX-001 (abaixo) muda o trabalho de SEC-001/002/004.
> Se você escolher "divisão total real", os furos de barreira de clínica se resolvem de brinde ao
> mover para `getClinicContext`. Se escolher "manter compartilhado", aí SEC-001/002/004 viram
> patches pontuais. Decida CPLX-001 antes dos SEC.

---

## CPLX-001 — Núcleo de negócio ainda compartilhado (estratégico)

**Hoje:** overview/insights/goals/crm/financeiro/pacientes/procedimentos/agendamentos rodam num
código único keyed por `clientId`/`role`. Painel da clínica e visão da agência usam as MESMAS
queries; só muda de onde vem o `clientId`.

| Opção                                                   | O que é                                                                                                                                                                                                                        | Impacto no produto                                                                                                                                  | Esforço/Risco                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A — Aceitar como design**                             | Renomear "divisão total"→"parcial". Documentar que o núcleo é compartilhado e seguro por `clientId`.                                                                                                                           | Nada muda pro usuário. Bug de KPI/cálculo se conserta em 1 lugar só. Admin e clínica veem sempre a mesma lógica (consistência).                     | Nenhum / nenhum                                                                            |
| **B — Divisão total real**                              | Migrar as 8 telas para `src/domains/clinic/*` com `getClinicContext`, duplicando queries.                                                                                                                                      | Clínica e admin passam a evoluir **features independentes** (clínica ganha campo/coluna/visão própria sem afetar a agência).                        | **L** / alto — duplica lógica; bug de cálculo precisa fix em 2 lugares; risco de regressão |
| 👉 **C — Híbrido: isolar acesso, compartilhar cálculo** | Manter os **services puros** (`kpi/*`, `insights/*`, PDF) compartilhados — é matemática idêntica, não deve divergir. Isolar só a **entrada de dados**: wrappers finos por domínio com `getClinicContext` chamando os services. | Barreira de clínica forte por tipo, sem duplicar a matemática. Produto igual hoje; base pronta pra divergir features depois sem reescrever cálculo. | **M** / médio                                                                              |

**Pergunta de produto que decide isto:** _você quer, no médio prazo, que a clínica tenha telas/
campos diferentes da visão da agência?_ Se **sim** → B ou C. Se **não, é a mesma informação vista
por dois ângulos** → A (e os SEC viram patches).

---

## SEC-001 — Read-queries sem `assertClientAccess` (IDOR latente)

**Hoje:** 6 wrappers (`getPatients`, `getAppointments`, `getProcedures*`, `getPipelineData`,
`getClient`) repassam `clientId` ao repo sem revalidar contra a sessão. Repo só filtra `organizationId`.

| Opção                                           | O que é                                                                                                       | Impacto no produto                                                          | Esforço/Risco                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| 👉 **A — `assertClientAccess` em cada wrapper** | 1 linha por função, igual ao que `getGoalsWithProgress` já faz.                                               | Zero UX. Fecha IDOR cross-clínica de forma defensiva.                       | **S** / quase nulo                       |
| **B — Garantia estrutural por tipo**            | Criar tipo `ScopedClientId` que só `assertClientAccess` produz; repos passam a exigi-lo. Impossível esquecer. | Zero UX. Garantia em tempo de compilação — nunca mais nasce um furo desses. | **M** / médio (toca assinaturas de repo) |
| **C — Não fazer**                               | Confiar que a UI sempre passa `clientId` de sessão.                                                           | Zero trabalho. Frágil: 1 caller novo com input de usuário reabre o furo.    | nenhum / risco latente                   |

> Se escolher CPLX-001 **B/C**, isso já vem resolvido (entrada via `getClinicContext`). Se CPLX-001 **A**, faça SEC-001 **A** agora.

---

## SEC-002 — `getPipeline` sem `organizationId`

**Hoje:** `pipelineStage.findMany({ where: { clientId } })` — sem org.

| Opção                                    | O que é  | Impacto                                         | Esforço/Risco |
| ---------------------------------------- | -------- | ----------------------------------------------- | ------------- |
| 👉 **A — Add `organizationId` ao where** | 1 linha. | Zero UX. Fecha o escopo mais fraco do conjunto. | **S** / nulo  |

Não há trade-off real aqui — é correção pura. Faça junto do SEC-001.

---

## SEC-004 — Read-queries sem `assertCan` (RBAC de leitura decorativo) — CONFIRMADO

**Hoje:** revogar leitura de um módulo via `UserPermission` **não bloqueia** a query nos módulos
legados. Os toggles de leitura na UI mentem.

**Pergunta de produto que decide isto:** _permissão de leitura por módulo deve ser uma coisa real,
ou todo mundo na clínica/agência pode ver tudo do seu escopo?_

| Opção                                     | O que é                                                                                                                                    | Impacto no produto                                                                                                                             | Esforço/Risco                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 👉 **A — `assertCan(read)` nas wrappers** | Gate de leitura na camada de query.                                                                                                        | Os toggles de leitura passam a valer. Um usuário com leitura revogada é barrado (comportamento esperado). Admins configuram acesso de verdade. | **S** / baixo (cuidar p/ defaults não barrarem ninguém — hoje quase todos têm read) |
| **B — Gate na página**                    | `assertCan` no `layout/page` antes de chamar a query.                                                                                      | Mesmo efeito, "falha antes da query". Mas espalhado por muitas páginas, fácil esquecer uma.                                                    | **M** / médio (propenso a erro)                                                     |
| **C — Assumir leitura aberta**            | Documentar que leitura é livre dentro do escopo; só escrita/exclusão são gateadas. **Remover os toggles de leitura da UI** p/ não enganar. | Modelo mental simples ("vê tudo da sua clínica; ações é que são controladas"). Comum em B2B pequeno.                                           | **S** / baixo, mas reduz granularidade de RBAC                                      |

---

## SEC-003 — Webhook sem validação de assinatura

**Hoje:** aceita qualquer POST; inócuo porque providers são mock e nada é processado.

| Opção                                               | O que é                                                          | Impacto no produto                                                                 | Esforço/Risco                                             |
| --------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **A — Adiar (documentar pré-requisito de go-live)** | Deixar como está; exigir validação quando o adapter real entrar. | Nada agora. Risco só quando ligar integração de verdade.                           | nenhum / risco só futuro                                  |
| 👉 **B — Fechar a porta por padrão agora**          | Guard genérico: 401 a menos que venha segredo/assinatura.        | A integração não "funciona por acidente" — força fiação correta no dia do go-live. | **S** / baixo                                             |
| **C — Validação por provider já**                   | HMAC Meta/WhatsApp/Google agora.                                 | Pronto pra produção.                                                               | **M** / desperdício se a forma da API mudar (hoje é mock) |

Recomendo **B** se há integração no horizonte; **A** se está longe.

---

## PERF-001 — Crons varrem todos os clientes

**Hoje:** snapshots/reports/insights iteram a org inteira; `findDue/OverdueActivities` sem índice.
Sem leak; concorrência limitada; idempotente.

| Opção                                                            | O que é                                 | Impacto no produto                                         | Esforço/Risco             |
| ---------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| 👉 **A — Medir primeiro, não mexer**                             | Instrumentar duração do cron em prod.   | Nada até crescer. Decisão baseada em dado.                 | nenhum                    |
| **B — Índice `[status,dueDate]` (ou `[domain,status,dueDate]`)** | Migration de índice para as activities. | Cron mais rápido, menos carga no DB quando o volume subir. | **S** + migration / baixo |
| **C — Paginação/cursor + split por domínio**                     | Reescrever loop dos jobs.               | Escalável, falha isolável por domínio.                     | **M** / prematuro hoje    |

Sequência sã: **A agora → B quando a medição justificar.**

---

## BUG-001 — Export engole erro e não valida datas

| Opção                                                     | O que é                                                      | Impacto no produto                                                                                | Esforço/Risco |
| --------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------- |
| 👉 **A — Status code certo + validar datas + logar erro** | `ForbiddenError`→403, `404`, `500`; rejeitar `Invalid Date`. | Erro de export deixa de ser "500 misterioso"; export com data inválida avisa em vez de vir vazio. | **S** / baixo |
| **B — Mínimo: só parar de engolir**                       | Logar o erro, manter 500.                                    | Diagnóstico melhora; UX igual.                                                                    | **XS**        |

---

## SEC-005 — E-mails (PII) em log do job de relatórios

| Opção                     | O que é                                           | Impacto no produto                                                 | Esforço/Risco |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ------------- |
| 👉 **A — Logar contagem** | `{ recipients: to.length }` no lugar dos e-mails. | Conformidade LGPD; perde-se a lista no log (raramente necessária). | **XS** / nulo |
| **B — Mascarar**          | `k***@dominio.com`.                               | LGPD ok + algum poder de debug.                                    | **XS**        |

---

## Pacote sugerido (se quiser uma trilha pronta)

1. **Decidir os 2 forks de produto:** CPLX-001 (features divergentes no futuro? → A/C) e
   SEC-004 (permissão de leitura é real? → A/C).
2. **Sprint de hardening (S, baixo risco, alto valor):** SEC-001·A + SEC-002·A + SEC-004·A +
   BUG-001·A + SEC-005·A. Fecha 4 dos 5 top riscos num PR pequeno.
3. **SEC-003·B** se integração estiver no horizonte.
4. **PERF-001·A** (instrumentar) agora; **B** depois.
5. **CPLX-001·C** como projeto à parte, se a resposta do fork 1 pedir divergência.
