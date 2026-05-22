# PROMPT DE REFORMA — DIVISÃO TOTAL CLÍNICA × ADMIN

## Step-by-step para isolar completamente os domínios Admin (agência) e Clínica, no mesmo repositório

### Para execução por Claude Opus 4.7 dentro do Claude Code (múltiplas sessões)

---

## 📌 META-INSTRUÇÕES (LEIA INTEIRO ANTES DE TOCAR EM CÓDIGO)

Você é **Arquiteto de Software Sênior + Tech Lead** especializado em SaaS B2B multi-tenant. Sua missão é **reformar** (não recriar) o KPI Clinic OS para que os dois domínios — **Admin/agência** e **Clínica** — fiquem **totalmente isolados em funcionalidade**, vivendo no **mesmo repositório, mesmo deploy, mesmo banco**.

**Regras inegociáveis:**

1. **REFORMA, NÃO GREENFIELD.** O sistema existe e está em uso. Você adapta, refatora e move código existente. Recriar do zero é proibido. Antes de criar algo novo, prove que o existente não serve.
2. **Não cabe em uma sessão.** Siga o **Protocolo Multi-Sessão** (Seção 8) e o **Plano por Fases** (Seção 7). Uma fase (ou parte dela) por sessão. Ao fim de cada uma: pare, teste, reporte, peça validação.
3. **Cada fase é testável e reversível.** Nada de big-bang. Se uma fase não pode ser revertida com segurança, quebre-a em sub-passos menores.
4. **Segurança em primeiro lugar.** Isolamento de tenant é a razão de existir desta reforma. Toda mudança que toca query/autorização passa pelo crivo da Seção 4. Furo de dados entre clínicas = produto morto.
5. **Migrations sempre aditivas primeiro.** Coluna nova = nullable → backfill → só então enforce/`NOT NULL`. Nunca uma migration que possa travar deploy ou perder dado. Nunca rode `migrate reset` em ambiente com dado.
6. **Quando houver ambiguidade de regra de negócio, PARE e pergunte.** Não invente comportamento.
7. **Toda decisão técnica não trivial é justificada** — em comentário no código ou no relatório de fase.
8. **Português, BRL, fuso `America/Sao_Paulo`, LGPD.**

> **Antes de começar qualquer fase:** se existir `prompt/auditoria-achados.md` ou `prompt/auditoria-relatorio.md` (da auditoria irmã), leia. Achados P0/P1 de segurança que toquem a área da fase atual devem ser corrigidos **dentro** da fase, não depois.

---

## SEÇÃO 1 — ESTADO ATUAL (ponto de partida; RECONFIRME lendo o código, o repo muda)

Resumo do produto detalhado em `prompt/prompt.Md`. O essencial:

- **Tenant raiz** = `Organization`. **Todos** os usuários (agência + clínica) são linhas em `User` sob a mesma `Organization`. O que distingue a clínica é `User.clientId`.
- **Roles** (`UserRole`): `ADMIN`, `STAFF` (agência) · `CLIENT_OWNER`, `CLIENT_STAFF` (clínica).
- **Dois route groups** (Next.js App Router):
  - `src/app/(admin)/` — só ADMIN/STAFF: dashboard, clients, pipeline, **activities**, **calendar**, **notifications**, staff, settings/audit.
  - `src/app/(client)/` — só CLIENT\_\*: overview, insights, goals, crm, financial, patients, appointments, procedures. **Não tem** página própria de activities/calendar/notifications (só o sino do topbar).
- **Contexto/segurança:** `src/server/tenant/context.ts` → `getTenantContext()` (devolve `{ userId, organizationId, role, clientId }`) e `assertClientAccess(ctx, clientId)`. Autorização granular em `src/server/auth/assert-can.ts` (`assertCan(ctx, modulo, acao)`) + tabela `UserPermission`.

### 1.1 O que HOJE é compartilhado entre os dois painéis (o que esta reforma vai cortar)

> Hipótese levantada em sessão anterior — confirme cada item lendo o código atual.

| Recurso                | Como está compartilhado                                                                                                                                                                                     | Arquivos-chave                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Layout / navegação** | Componente único ramificado por `role`                                                                                                                                                                      | `src/components/layout/app-sidebar.tsx` (`buildAdminNav`/`buildClientNav`), `app-topbar.tsx`; layouts `(admin)/layout.tsx` e `(client)/layout.tsx`                                                                 |
| **Notificações**       | Tabela `Notification` só com `userId` (sem `clientId`/`organizationId`). Service e queries únicos. Separação só por destinatário.                                                                           | `src/server/services/notification-service.ts`, `src/server/queries/notification-queries.ts`, `src/server/repositories/notification-repository.ts`, `src/modules/notifications/`, `src/app/api/cron/notifications/` |
| **Atividades**         | `Activity` é `organizationId`-scoped; `clientId` opcional (etiqueta). `resolveAssignee` só permite assignee ADMIN/STAFF. Fan-out "Todos" varre `role: {in:['ADMIN','STAFF']}` da org. Hoje só painel admin. | `src/server/actions/activity-actions.ts`, `src/server/repositories/activity-repository.ts`, `src/modules/activities/`                                                                                              |
| **Calendário**         | `CalendarEvent` é `organizationId` + `userId`. Sync 1:1 com `Activity`. Hoje só painel admin.                                                                                                               | `src/server/actions/calendar-event-actions.ts`, `src/server/repositories/calendar-event-repository.ts`, `src/modules/calendar/`                                                                                    |
| **Contexto de tenant** | `getTenantContext` único para os 4 roles.                                                                                                                                                                   | `src/server/tenant/context.ts`                                                                                                                                                                                     |

### 1.2 Análise técnica que fundamenta esta reforma (referência — já validada com o usuário)

**O que envolve dar recursos próprios à Clínica:**

- Rotas novas em `(client)`: `/calendar`, `/activities`, `/notifications`.
- `CalendarEvent` (hoje `userId`+`organizationId`) continua funcionando para clínica-user — mas para **isolamento por domínio** precisa de escopo de `clientId` explícito e garantido (ver Seção 3.3).
- `Activity` já tem `clientId` opcional → reusável, mas `resolveAssignee` trava assignee a ADMIN/STAFF → precisa de variante de clínica.
- `Notification` é por `userId` → funciona, mas falta página/rota e escopo de domínio.

**Ganhos:** clínica vira ferramenta de gestão (não só dashboard read-only); mais valor/retenção; mais isolamento por design; queries de clínica em conjuntos menores (`clientId`/`userId`) → perf boa; notificação já é por destinatário.

**Riscos (o que mata):**

- **Nº 1 — vazamento cross-tenant:** `Activity.buildWhere` filtra por `organizationId` mas **não força `clientId`**. Expor a tela à clínica sem forçar `where.clientId = ctx.clientId` para roles CLIENT\_\* → clínica vê atividade de toda a org. **P0.**
- `resolveAssignee` liberado para CLIENT\_\* sem trava → atribuir a outra clínica ou à agência.
- Fan-out "Todos" varrendo a org inteira a partir de uma clínica.
- Perf: falta `@@index([clientId, status, dueDate])` em `Activity`; crons `findDueActivities`/`findOverdueActivities` varrem a tabela inteira sem filtro de tenant.
- **Custo real não é o banco — é a lógica de autorização e a manutenção dos componentes hoje compartilhados.** É exatamente isso que esta reforma ataca de frente.

---

## SEÇÃO 2 — OBJETIVO E DEFINIÇÃO DE "DIVISÃO TOTAL"

**Decisão de arquitetura (tomada pelo usuário):** _mesmo repositório, domínios isolados._ Um código, um deploy, um banco — mas **a aba do Admin não compartilha NENHUMA funcionalidade com as Clínicas**, e vice-versa.

"Divisão total" significa, concretamente:

1. **Zero lógica de negócio compartilhada** entre Admin e Clínica. Nada de componente único com `if (role === ...)` para alternar comportamento de feature. Cada domínio tem seus próprios: rotas, server actions, queries, repositories, services de feature e componentes.
2. **Clínica vira tenant de 1ª classe.** Todo dado operacional da clínica é escopado e garantido por `clientId` numa camada que **não dá para esquecer** (não depende de o programador lembrar de filtrar).
3. **O que continua compartilhado — e SÓ isto:**
   - **Primitivos de UI** (shadcn) em `src/components/ui/` — botão, dialog, input. Burros, sem regra de domínio.
   - **Infra transversal:** `src/lib/` (prisma client, env, logger, helpers de data, utils), o núcleo de auth (NextAuth), e o primitivo de contexto de tenant.
   - **Schema do banco** (um só), com escopo garantido por domínio (Seção 3.3).
4. **Admin enxerga clínicas só pelo que é dele:** dado contratual/agregado/CRM-da-agência sobre a clínica (já existe em `(admin)/clients/[clientId]`). Admin **não** opera as ferramentas internas da clínica (agenda/tarefas/notificações da clínica), e a clínica **não** vê nada da agência.

**Fora de escopo (não fazer nesta reforma):** split em dois repos/deploys; separar bancos/schemas físicos; trocar de framework/ORM/auth. Tudo permanece no stack atual (Next.js App Router, Prisma, PostgreSQL/Supabase, NextAuth v5, Tailwind/shadcn).

---

## SEÇÃO 3 — ARQUITETURA-ALVO

### 3.1 Estrutura de pastas (organização por domínio)

Migrar incrementalmente de organização por tipo-técnico para organização por **domínio**. Alvo:

```
src/
  app/
    (admin)/        # rotas só agência (já existe)
    (clinic)/       # rotas só clínica (hoje (client) — renomear/realinhar)
    (auth)/         # login etc. (compartilhado: é pré-tenant)
    api/
  domains/
    admin/          # tudo que é exclusivo da agência
      activities/   # actions + repo + components + queries da agência
      calendar/
      notifications/
      ...
    clinic/         # tudo que é exclusivo da clínica
      activities/
      calendar/
      notifications/
      ...
    shared/         # SÓ transversal de negócio que ambos legitimamente usam
                    # (manter mínimo; na dúvida, NÃO é shared)
  components/
    ui/             # primitivos shadcn — únicos componentes compartilhados
    admin/          # layout/topbar/sidebar do admin
    clinic/         # layout/topbar/sidebar da clínica
  lib/              # infra transversal (prisma, env, logger, date, utils)
  server/
    auth/           # núcleo de auth + contextos de domínio (Seção 3.2)
    tenant/         # primitivo de contexto
```

> **Pragmatismo:** não é preciso mover tudo de uma vez. Mova **por fase**, conforme a feature é separada. O alvo guia, mas o caminho é incremental. Renomear `(client)` → `(clinic)` é opcional e cosmético — se fizer, faça numa fase isolada com ajuste de imports e testes.

### 3.2 Contextos de domínio (a espinha dorsal da segurança)

Hoje há um `getTenantContext()` genérico. Introduza **dois contextos especializados** que tornam o escopo impossível de esquecer:

```ts
// src/server/auth/admin-context.ts
export type AdminContext = { userId: string; organizationId: string; role: 'ADMIN' | 'STAFF' }
export async function getAdminContext(): Promise<AdminContext> {
  const ctx = await getTenantContext()
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') throw new ForbiddenError('Domínio admin')
  return { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role }
}

// src/server/auth/clinic-context.ts
export type ClinicContext = {
  userId: string
  organizationId: string
  role: 'CLIENT_OWNER' | 'CLIENT_STAFF'
  clientId: string
}
export async function getClinicContext(): Promise<ClinicContext> {
  const ctx = await getTenantContext()
  if (ctx.role !== 'CLIENT_OWNER' && ctx.role !== 'CLIENT_STAFF')
    throw new ForbiddenError('Domínio clínica')
  if (!ctx.clientId) throw new ForbiddenError('Sessão de clínica sem clientId') // invariante crítica
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    role: ctx.role,
    clientId: ctx.clientId,
  }
}
```

**Por quê:** `ClinicContext` carrega `clientId` como `string` (não `string | null`). Repositories de clínica recebem `ClinicContext` e injetam `clientId` no `where` **sempre**. Esquecer o filtro vira erro de tipo, não vazamento em produção. Esta é a defesa-em-profundidade que substitui "lembrar de filtrar".

### 3.3 Modelo de dados — escopo garantido por domínio

Princípio: **não duplicar tabelas**; adicionar escopo e garantir o filtro na camada de acesso.

- **`Activity`** — já tem `clientId String?`. Para o domínio clínica, `clientId` passa a ser **obrigatório** (atividade de clínica sempre tem dono-clínica). Atividade da agência tem `clientId = null` (interna) ou aponta a clínica como etiqueta de CRM, mas vive no domínio admin. Adicionar `@@index([clientId, status, dueDate])`.
- **`CalendarEvent`** — hoje `organizationId` + `userId`. Adicionar `clientId String?` (nullable). Evento de clínica recebe `clientId`; evento de agência fica `null`. Index `@@index([clientId, startAt])`. Migration aditiva + backfill (eventos de usuários CLIENT\_\* recebem o `clientId` do usuário).
- **`Notification`** — hoje só `userId`. Para consultar/garantir domínio sem depender de join, adicionar **`clientId String?`** (nullable; preenchido quando o destinatário é de clínica) e/ou um enum `domain` (`ADMIN`|`CLINIC`). Backfill a partir do `User.clientId` do destinatário. Index `@@index([clientId, readAt])`.

> Decisão a confirmar com o usuário antes da Fase 1: usar **coluna `clientId`** (mais simples, denormaliza) vs **enum `domain`** (mais explícito) vs **ambos**. Recomendação: `clientId` nullable + derivar domínio dele (clientId != null ⇒ clínica). Menos colunas, escopo direto.

### 3.4 Regra de ouro do isolamento

> Toda função de acesso a dado operacional de clínica recebe `ClinicContext` e aplica `where.clientId = ctx.clientId` **incondicionalmente**, ignorando qualquer `clientId` vindo de input. Toda função de domínio admin recebe `AdminContext`. **Nenhuma função de feature aceita os dois contextos.** Se precisa dos dois, está mal modelada — separe.

---

## SEÇÃO 4 — SEGURANÇA (guard-rails e erros comuns)

**Princípios:**

1. **Defesa em profundidade.** Route group (layout redireciona role errado) **é a camada externa, não a única.** A camada de dado (repository + contexto tipado) é a que realmente garante. Nunca confie só na rota.
2. **Negar por padrão.** Query sem escopo de tenant não compila/não passa em review. Contexto de clínica sem `clientId` lança erro.
3. **Nunca confiar em `clientId`/`organizationId` vindo do form/URL** (§5.3 do prompt principal). Sempre derivar da sessão via contexto.
4. **`assertCan` continua valendo** dentro de cada domínio para permissões granulares (CLIENT_OWNER vs CLIENT_STAFF; ADMIN vs STAFF).

**Erros comuns a EVITAR (catálogo):**

- ❌ Reusar `activity-repository.buildWhere` para clínica sem forçar `clientId` → **vazamento P0**. ✅ Repository de clínica recebe `ClinicContext` e injeta `clientId`.
- ❌ `resolveAssignee` permitindo clínica atribuir a usuário de outra clínica/agência. ✅ Variante de clínica resolve assignee **somente** entre `User` com o mesmo `clientId`.
- ❌ Fan-out "Todos" da clínica varrendo `role IN (ADMIN,STAFF)` ou a org inteira. ✅ Fan-out de clínica = usuários `CLIENT_*` **do mesmo `clientId`**.
- ❌ Notificação de clínica caindo em ADMIN, ou link de notificação apontando rota do outro domínio. ✅ Destinatário e `link` resolvidos dentro do domínio.
- ❌ Sync `Activity`↔`CalendarEvent` cruzando domínios (atividade de clínica criando evento no calendário da agência). ✅ Sync herda `clientId` da atividade.
- ❌ Cron/webhook sem autenticação ou sem filtro de tenant processando dado dos dois domínios misturado.
- ❌ Vazar PII/segredo em log ou em mensagem de erro devolvida ao client.
- ❌ Migration que torna coluna `NOT NULL` antes do backfill → quebra deploy.

**Teste de isolamento obrigatório (Fase de hardening):** com um usuário CLIENT_OWNER da clínica A, tentar — via manipulação de id em action/URL — ler/editar atividade, evento e notificação da clínica B e da agência. Todos devem falhar com Forbidden/NotFound. Automatizar como teste (Vitest/Playwright) nos fluxos críticos.

---

## SEÇÃO 5 — PERFORMANCE (guard-rails e erros comuns)

**Princípios:**

1. Escopo por `clientId`/`userId` **reduz** os conjuntos → tende a melhorar perf. Garanta que o índice cobre o `where` + `orderBy` reais.
2. Toda listagem tem `take`/paginação. Nada de `findMany` ilimitado exposto a crescimento.
3. Trabalho pesado vai para job/cron, não para o request.

**Erros comuns a EVITAR:**

- ❌ Filtrar por `clientId` sem índice que comece por `clientId` → scan parcial. ✅ Adicionar `@@index([clientId, status, dueDate])` (Activity), `@@index([clientId, startAt])` (CalendarEvent), `@@index([clientId, readAt])` (Notification).
- ❌ Crons `findDueActivities`/`findOverdueActivities` varrendo a tabela inteira sem filtro — piora com volume e agora processa dois domínios. ✅ Avaliar particionar o cron por domínio e/ou filtrar por janelas + índices; medir antes/depois.
- ❌ N+1 ao montar listas (ex.: buscar assignee/cliente por item). ✅ `include`/`select` na query única.
- ❌ `revalidatePath` revalidando rotas do outro domínio. ✅ Revalidar só as rotas do domínio que mudou.
- ❌ `Promise.all` sobre fan-out não-limitado (clínica grande). ✅ Limitar e/ou processar em lote.

---

## SEÇÃO 6 — ESTRATÉGIA DE MIGRAÇÃO

**Padrão: Strangler Fig.** Cada feature é estrangulada e substituída pela versão isolada, uma de cada vez, mantendo o sistema funcionando o tempo todo.

- **Ordem:** primeiro a fundação (contextos + escopo de dado), depois feature por feature (a menos acoplada primeiro), por último a limpeza dos componentes compartilhados e o dead code.
- **Reversibilidade:** prefira adicionar o novo caminho ao lado do antigo e cortar o antigo só quando o novo estiver validado. Migrations sempre aditivas.
- **Feature flag (opcional):** se o usuário topar, exponha as telas novas da clínica atrás de uma flag por env (`CLINIC_FEATURES_ENABLED`) para liberar gradualmente. Se não, libere por fase validada.
- **Sem janela de quebra:** nenhuma fase deixa o `main` sem buildar ou com tela quebrada.

---

## SEÇÃO 7 — PLANO PASSO A PASSO (FASES)

> Cada fase: **objetivo · pré-condição · passos · arquivos · riscos · como testar · critério de pronto (DoD)**. Faça uma fase (ou sub-parte) por sessão. Ao terminar, registre no ledger (Seção 8), teste e reporte.

### FASE 0 — Fundação: contextos de domínio + invariantes

- **Objetivo:** criar `getAdminContext`/`getClinicContext` (Seção 3.2) e adotá-los nas actions existentes sem mudar comportamento ainda.
- **Passos:** criar os dois contextos; substituir `getTenantContext` por eles nas actions onde o domínio já é evidente; garantir que `getClinicContext` lança se faltar `clientId`.
- **Riscos:** quebrar action que assumia o contexto genérico. Mitigar: mudança mecânica, um arquivo por vez, rodar typecheck.
- **Como testar:** `tsc`/build verde; smoke test de login admin e login clínica; nenhuma action muda saída.
- **DoD:** contextos existem, tipados, com guarda de role/`clientId`; nenhuma regressão.

### FASE 1 — Camada de dados: escopo garantido (migrations aditivas)

- **Pré-condição:** decisão `clientId` vs `domain` confirmada (Seção 3.3).
- **Passos:** adicionar `clientId` nullable a `CalendarEvent` e `Notification`; adicionar índices (`[clientId,...]`); migration aditiva; **backfill** (derivar `clientId` do `User` destinatário/dono); validar dados; **só depois**, onde aplicável, planejar enforce.
- **Riscos:** backfill incorreto; lock em tabela grande. Mitigar: backfill em lote, fora do horário de pico, idempotente.
- **Como testar:** contagens antes/depois batem; nenhum registro de clínica com `clientId` nulo após backfill; query plan usa o índice novo (`EXPLAIN`).
- **DoD:** colunas + índices em produção; backfill conferido; nada quebrado.

### FASE 2 — Notificações isoladas

- **Objetivo:** Clínica tem sua página/rota de notificações; admin e clínica não compartilham service de feature.
- **Passos:** separar `notification-service`/queries por domínio (ou parametrizar com contexto tipado garantindo escopo); rota `(clinic)/notifications`; `getRecipientsForClinic` (destinatários = `CLIENT_*` do mesmo `clientId`); links de notificação apontam o domínio correto; cron de notificações escopa por domínio.
- **Riscos:** notificação cruzando domínio; link errado. Ver Seção 4.
- **Como testar:** clínica A só vê suas notificações; admin não recebe notif de clínica e vice-versa; teste de isolamento.
- **DoD:** dois fluxos independentes; isolamento provado.

### FASE 3 — Atividades isoladas

- **Objetivo:** Clínica tem `/activities` próprio; repositório/actions de clínica separados, escopo `clientId` garantido.
- **Passos:** repository de clínica recebe `ClinicContext` e injeta `where.clientId`; `resolveAssignee` variante de clínica (só mesmo `clientId`); fan-out "Todos" da clínica = `CLIENT_*` do mesmo `clientId`; componentes de atividade da clínica em `components/clinic` (sem `if role`); rota `(clinic)/activities`; corrigir o achado P0 da Seção 1.2.
- **Riscos:** **vazamento P0** se reusar `buildWhere` admin sem escopo. Seção 4.
- **Como testar:** clínica A não enxerga atividade da clínica B nem da agência (inclusive tentando forjar id); admin não vê atividade interna da clínica.
- **DoD:** domínios independentes; índice em uso; isolamento provado por teste.

### FASE 4 — Calendário isolado

- **Objetivo:** Clínica tem `/calendar` próprio, escopado por `clientId`; sync `Activity`↔`CalendarEvent` respeita o domínio.
- **Passos:** repositório de calendário de clínica com `ClinicContext`; eventos da clínica gravam `clientId`; sync herda `clientId` da atividade; componentes de calendário da clínica em `components/clinic`; rota `(clinic)/calendar`; feriados/`OrgHoliday` — decidir se clínica vê os da org ou tem os próprios (perguntar ao usuário).
- **Riscos:** sync cruzando domínio; evento sem `clientId`.
- **Como testar:** isolamento de eventos por clínica; criar atividade de clínica com "adicionar ao calendário" cai no calendário certo.
- **DoD:** independência + isolamento provados.

### FASE 5 — Componentes de layout separados

- **Objetivo:** acabar com sidebar/topbar role-branched.
- **Passos:** dividir `app-sidebar`/`app-topbar` em versões `components/admin/*` e `components/clinic/*`; cada layout usa a sua; remover `buildAdminNav`/`buildClientNav` do arquivo único; `NotificationBell` aponta o domínio certo.
- **Riscos:** divergência visual; duplicação boba. Mitigar: extrair primitivos comuns para `components/ui` se forem realmente burros.
- **Como testar:** ambos os painéis renderizam; navegação correta por role.
- **DoD:** zero `if (role === ...)` de feature em layout.

### FASE 6 — Rotas e navegação da clínica completas

- **Objetivo:** `(clinic)` ganha os itens de menu novos (activities/calendar/notifications) e a navegação reflete o domínio.
- **Passos:** atualizar nav da clínica; permissões (`CLIENT_OWNER` vs `CLIENT_STAFF`) nas novas telas via `assertCan`; revalidação escopada ao domínio.
- **DoD:** clínica navega nas features novas com permissões corretas.

### FASE 7 — Limpeza e dead code

- **Objetivo:** remover ramos mortos, código que só existia para servir os dois domínios juntos, contratos implícitos.
- **Passos:** remover branches `if role` órfãos; remover do domínio admin qualquer noção de "clínica opera aqui"; consolidar `shared/` ao mínimo; documentar o que sobrou em `shared` e por quê.
- **DoD:** `shared/` mínimo e justificado; sem dead code; lint/typecheck limpos.

### FASE 8 — Hardening: isolamento, performance, testes

- **Objetivo:** provar que a divisão é real.
- **Passos:** testes automatizados de isolamento cross-tenant (Seção 4); medir queries das telas novas (índices em uso, sem N+1); revisar crons sob volume; revisar logs (sem PII).
- **DoD:** suíte de isolamento verde; perf das telas principais dentro do aceitável; relatório final de reforma.

---

## SEÇÃO 8 — PROTOCOLO MULTI-SESSÃO

Estado persistente em **`prompt/reforma-progresso.md`** (o "ledger").

**Início de sessão:** abrir o ledger (criar do esqueleto 8.1 se não existir); ler progresso; anunciar a fase/sub-parte da sessão; ler achados de auditoria relevantes se existirem.

**Durante:** executar, registrando decisões e desvios no ledger conforme acontecem.

**Fim de sessão:** atualizar status da fase (`PENDENTE`/`EM ANDAMENTO`/`CONCLUÍDA`); escrever **relatório de fase** (o que foi feito, o que ficou pendente, decisões técnicas + justificativa, riscos, como testar); deixar o `main` buildando; **não** começar fase nova se o contexto estiver perto do limite — pare com o ledger consistente.

### 8.1 Esqueleto do ledger (`prompt/reforma-progresso.md`)

```markdown
# Reforma Divisão Total — Progresso

## Decisões travadas

- Arquitetura: mesmo repo, domínios isolados.
- Escopo de dado: <clientId | domain | ambos> (Fase 1)
- Feature flag: <sim/não>
- Feriados na clínica: <decisão da Fase 4>

## Status por fase

| Fase | Título               | Status   | Sessão | Notas |
| ---- | -------------------- | -------- | ------ | ----- |
| 0    | Contextos de domínio | PENDENTE | —      |       |
| 1    | Escopo de dados      | PENDENTE | —      |       |
| ...  | ...                  | ...      | ...    |       |

## Relatórios de fase

<!-- append-only, mais recente embaixo -->

## Pendências e riscos abertos

<!-- itens que cruzam fases -->
```

---

## SEÇÃO 9 — DEFINITION OF DONE (reforma completa)

- Nenhum componente/action/repository/service de **feature** é compartilhado entre Admin e Clínica. O compartilhado se resume a `components/ui`, `lib/` e o núcleo de auth/tenant.
- Todo dado operacional de clínica é escopado por `clientId` numa camada tipada que não dá para esquecer (`ClinicContext`).
- Testes de isolamento cross-tenant passam (clínica A ⊥ clínica B ⊥ agência).
- Índices cobrem os `where`/`orderBy` das telas novas; sem N+1 nas listas principais.
- `main` builda; lint/typecheck limpos; sem dead code de role-branching de feature.
- Relatório final em `prompt/reforma-relatorio.md`: o que mudou, mapa antes×depois do acoplamento, migrations aplicadas, riscos residuais, próximos passos.

---

## SEÇÃO 10 — LIMITES

- **Não** split de repo/deploy, **não** separar banco/schema físico, **não** trocar stack — fora de escopo (Seção 2).
- **Não** rodar migration destrutiva nem `migrate reset` em ambiente com dado.
- **Não** alterar regra de negócio sem o usuário confirmar — pare e pergunte.
- **Não** confiar no levantamento da Seção 1 sem reconfirmar no código atual.
- Encerre toda sessão com o ledger consistente e o `main` buildando.
