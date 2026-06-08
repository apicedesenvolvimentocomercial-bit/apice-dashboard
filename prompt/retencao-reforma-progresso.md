# Reforma da Pipeline de Retenção — Progresso

> Reformula o funil de RETENÇÃO (hoje `Ativo`/`Inativo`) num **ciclo de vida do
> paciente em 5 etapas** dirigidas por tempo + janela de recorrência do procedimento,
> com fundação para **disparo real de mensagem** (WhatsApp). Continua o ledger
> `pipelines-progresso.md` (estrutura de pipelines) e ataca os gaps P0 da
> `auditoria-produto.md` (§3/§4: WhatsApp mock, reativação sem ação, recorrência
> inexistente).

## Objetivo (proposta do produto)

Ciclo de relacionamento pós-procedimento, cada etapa com um objetivo emocional:

| #   | Etapa            | Objetivo     | Janela (desde última visita)                                |
| --- | ---------------- | ------------ | ----------------------------------------------------------- |
| 1   | Pós-procedimento | Encantamento | 0–24h                                                       |
| 2   | Nutrição         | Cuidado real | 2–15d                                                       |
| 3   | Reativação       | Autoridade   | janela de recorrência do procedimento venceu sem remarcar   |
| 4   | Fidelização      | Recorrência  | paciente recorrente, dentro da janela / com retorno marcado |
| 5   | Salvamento       | Comunidade   | inativo longo (> winback, default 120d)                     |

Cada etapa é um **bucket calculado**, não arrastado à mão. O card vive atrelado ao
`Patient` (mesmo modelo de hoje: nasce ao fechar/comparecer, some só ao excluir o
paciente). Comparecer de novo **reseta** o card p/ Pós-procedimento.

## Decisões travadas (sessão 2026-06-08)

- **Escopo agora = Fase A + Fase B + fundação de mensageria** (fila + templates
  ligados ao provider MOCK, trocável pelo real depois). NPS/indicação/clube = Fase D
  (futuro, só desenhado aqui).
- **Disparo ao paciente = preparar p/ WhatsApp real:** modelar fila/queue +
  templates agora, despachando pelo `WhatsappMockProvider` existente. Trocar a
  factory (`integrations/index.ts`) pelo provider real quando houver credencial —
  zero mudança no código consumidor (Strategy/Adapter já no lugar).
- **Etapas são calculadas pelo cron**, não por drag. O board ainda permite arrastar
  (override manual), mas a fonte da verdade é o tempo desde a última visita +
  `Procedure.recurrenceDays`.
- **Recorrência por-procedimento** substitui a "inatividade global" de hoje
  (`Client.inactivityDays` vira só o FALLBACK quando o procedimento não tem janela).
- Migração de dados das pipelines RETENTION existentes: ver "Fase A2".

## Modelo do ciclo (regras do bucket — fonte da verdade do cron)

Para cada `Patient` com card de retenção (ou elegível), o cron calcula:

- `lastVisitAt` = data do último `Appointment` ATTENDED (já em `Patient.lastVisitAt`).
- `returnWindow` = `Procedure.recurrenceDays` do procedimento principal da última
  visita; se `null`, usa `Client.inactivityDays` (fallback).
- `dueAt` = `lastVisitAt + returnWindow` (também denormalizado em
  `Patient.nextReturnDueAt` p/ a UI mostrar "retorno esperado").
- `hasFutureAppt` = existe Appointment SCHEDULED/CONFIRMED futuro.
- `isRecurrent` = ≥2 Appointments ATTENDED (cliente que já voltou ao menos uma vez).
- `daysSince` = dias desde `lastVisitAt`.

Bucket (primeiro que casar, de cima p/ baixo):

```
daysSince <= 1                          → POST_CARE
hasFutureAppt && isRecurrent            → LOYALTY     (recorrente comprometido)
daysSince <= 15                         → NURTURE
now <= dueAt                            → NURTURE     (ainda dentro da janela)
daysSince <= winbackDays (120)          → REACTIVATION (janela venceu, não remarcou)
else                                    → WINBACK
```

Notas:

- `LOYALTY` é estado de SAÚDE (recorrente + com retorno agendado), não um intervalo
  de tempo — por isso é checado cedo. Recorrente sem retorno marcado segue o fluxo de
  tempo normal (pode cair em Reativação/Salvamento como qualquer um).
- Mover p/ uma etapa **enfileira** a mensagem-template dessa etapa (idempotente: 1 por
  paciente por etapa por entrada — dedupe por `(patientId, stageKey)` enquanto o card
  não saiu da etapa).

## Schema (Fase A1 + B + mensageria)

Migration nova `2026XXXX_retention_lifecycle` (NÃO aplicar em prod — usuário aplica):

- **`StageNativeKey`** ganha `POST_CARE, NURTURE, REACTIVATION, LOYALTY, WINBACK`.
  `ACTIVE`/`INACTIVE` continuam no enum (não remover — etapas legadas podem usar; o
  data-backfill remapeia para os novos).
- **`Client.winbackDays Int @default(120)`** — corte Reativação→Salvamento.
  `inactivityDays` permanece como fallback da janela de retorno.
- **(Fase B) `Procedure.recurrenceDays Int?`** — janela recomendada de retorno / fim
  do efeito do procedimento. `null` = procedimento único (sem recorrência).
- **(Fase B) `Patient.nextReturnDueAt DateTime?`** — denorm do `dueAt` (setado ao
  comparecer; usado pela UI + cron). Best-effort; o cron recomputa.
- **(Mensageria) `MessageChannel { WHATSAPP, SMS, EMAIL }`** enum.
- **(Mensageria) `OutboundMessageStatus { QUEUED, SENT, FAILED, SKIPPED }`** enum.
- **(Mensageria) modelo `MessageTemplate`** (por-clínica): `id, organizationId,
clientId, key (String), channel, title?, body (Text, com {{vars}}), isActive`.
  `@@unique([clientId, key])`. **RLS: tabela com clientId → ENABLE+FORCE+policy na
  migration de RLS.**
- **(Mensageria) modelo `OutboundMessage`** (fila): `id, organizationId, clientId,
patientId?, channel, templateKey, payload Json (vars), status, scheduledFor,
sentAt?, externalId?, error?, dedupeKey? @unique`. Índices por `(clientId,
status, scheduledFor)`. **RLS idem.**

> **RLS (CLAUDE.md):** `MessageTemplate` e `OutboundMessage` têm `clientId` →
> entram OBRIGATORIAMENTE na migration de RLS (ENABLE + FORCE + policy), senão
> nascem sem defesa no banco. O `messages-job` é CROSS-clínica (contexto admin, GUC
> nula = exceção legítima, como o retention-job).

## Camadas

### Fase A — estrutura (5 etapas + progressão)

- `pipeline-repository.ts`: `RETENTION_NATIVE_STAGES` passa de 2 p/ 5 etapas
  (POST_CARE/NURTURE/REACTIVATION/LOYALTY/WINBACK, cores próprias). `RETENTION_NATIVE_ORDER`
  idem (sequência canônica p/ o reparo `ensureNativeStageKeys`).
- **Data-migration (A2):** para cada pipeline RETENTION existente, em SQL:
  - inserir as 5 etapas nativas que faltam (por `nativeKey`), preservando etapas livres;
  - remapear cards: etapa `ACTIVE` → `NURTURE` (estado neutro "ativo"); `INACTIVE` →
    `WINBACK`. Depois marcar as etapas `ACTIVE`/`INACTIVE` antigas como não-nativas ou
    removê-las se vazias (a FK de leads já terá migrado).
  - Idempotente: rodar de novo não duplica (checa `nativeKey` existente).
- `retention-job.ts` (A3): substitui o bloco "ACTIVE→INACTIVE em N dias" pela
  progressão de bucket acima. Migração Fechado→retenção agora pousa em `POST_CARE`
  (etapa de entrada). A rede de segurança (paciente ATTENDED sem card) idem.
  Mantém dedup comercial e idempotência.
- `retention-service.ts`: `getRetentionActiveStageId` → `getRetentionEntryStageId`
  (POST_CARE). `addPatientToRetention` pousa em POST_CARE.

### Fase B — recorrência por procedimento

- Schema acima (`Procedure.recurrenceDays`, `Patient.nextReturnDueAt`).
- `pipeline-stage-effects.ts`: ao marcar ATTENDED (`attendAppointment` /
  `attendLeadWithPatientData`), setar `Patient.nextReturnDueAt = attendedAt +
recurrenceDays` (do procedimento principal). Best-effort.
- UI: campo "Recorrência (dias)" no form de procedimento (`procedure-*`). Card de
  retenção mostra "retorno esperado em {data}" / "atrasado há Nd".

### Fundação de mensageria (preparar WhatsApp real)

- **`message-service.ts`** (novo): `enqueueMessage({clientId, patientId, channel,
templateKey, vars, scheduledFor?, dedupeKey?})` → grava `OutboundMessage` QUEUED
  (idempotente por `dedupeKey`). `renderTemplate(body, vars)` substitui `{{var}}`.
- **`messages-job.ts`** (novo cron): pega QUEUED com `scheduledFor <= now`, resolve o
  template, chama `getWhatsappProvider().sendMessage(...)` (MOCK hoje), grava
  `SENT`/`FAILED` + `externalId`. Cross-clínica (GUC nula). Registrar em `vercel.json`.
- `retention-job` chama `enqueueMessage` ao mover o card p/ POST_CARE/NURTURE/
  REACTIVATION/WINBACK, com `dedupeKey = ${patientId}:${stageKey}:${bucketEpoch}`.
- Templates default semeados por clínica (`ensureDefaultMessageTemplates`): um por
  etapa, texto editável depois.

## Fase D — futuro (só desenhado)

- **NPS/satisfação:** modelo `Survey`/`SurveyResponse`, link enviado no POST_CARE.
- **Indicação:** modelo `Referral` (quem indicou quem, benefício rastreável).
- **Clube/assinatura:** `Subscription` (cobrança recorrente; `RevenueType.RECORRENCIA`
  já existe) + integração de cobrança (P1 da auditoria).
- **WhatsApp real:** trocar a factory por Meta Cloud API / Z-API / Twilio + assinatura
  de webhook 2-way (`verifyProviderSignature` hoje stub).

## Status — FEITO (2026-06-08, exceto Fase D)

- [x] A1 schema (enum +5 valores + Client.winbackDays + 2 migrations: enum separado do
      backfill por causa do "ALTER TYPE ADD VALUE não usável na mesma transação").
- [x] A2 etapas nativas (5: Pós-procedimento/Nutrição/Reativação/Fidelização/Salvamento) + `RETENTION_NATIVE_ORDER` + `NATIVE_KEY_RANK` + data-migration das pipelines
      existentes (ACTIVE→NURTURE, INACTIVE→WINBACK; etapas livres preservadas).
- [x] A3 retention-job reescrito: `computeRetentionBucket` (pura, testada — 9 casos) +
      migração Fechado→entrada + rede de segurança + progressão por bucket.
- [x] B `Procedure.recurrenceDays` (form + repo + action) + `Patient.nextReturnDueAt`
      (escrito pelo cron, denorm p/ UI). Hook ao-comparecer ficou a cargo do cron
      (recomputa nightly) em vez dos 3 sites de ATTENDED (mais seguro).
- [x] Mensageria: `MessageTemplate`+`OutboundMessage` (+RLS na migration) +
      `message-service` (`enqueueMessage` idempotente, `renderTemplate`, templates
      default) + `messages-job` + cron `api/cron/messages` (07:30, em `vercel.json`).
      retention-job enfileira a msg do bucket (POST_CARE/NURTURE/REACTIVATION/WINBACK;
      LOYALTY não cutuca), dedupe por `ret:{patientId}:{bucket}:{dataDaÚltimaVisita}`.
- [x] Verificação: `type-check` ✓ · `lint` ✓ (0 erros) · `test` ✓ (189) · `build` ✓.

### UI grátis adicionada (2026-06-08, 2ª leva)

- **Card de retenção** mostra "Retorno {em/atrasado há} {data}" (badge âmbar quando
  atrasado). `Patient.nextReturnDueAt` threadado: `getPipeline` select → `KanbanLead.patient`
  → `lead-card.tsx`.
- **Configurações → "Mensagens automáticas (retenção)"** (só titular): edita os 4 templates
  (título/corpo/ativa, placeholders `{{nome}}/{{procedimento}}/{{clinica}}`) + tabela das
  últimas 30 mensagens da fila (status). `messaging-queries.getClinicMessaging`
  (`settings:read`, semeia defaults) + `message-actions.updateMessageTemplateAction`
  (`settings:write`, belt clientId) + `message-templates-card.tsx`.

### Pendências conhecidas (próximas sessões)

- **Email como canal real (GRÁTIS)**: `messages-job` entregar via Resend (já integrado) p/
  canal EMAIL / fallback sem telefone. Hoje só WHATSAPP (mock) despacha; resto fica SKIPPED.
- **Fase C real (PAGO)**: trocar `WhatsappMockProvider` por provider real (Meta/Z-API/Twilio)
  na factory `integrations/index.ts` + assinatura de webhook. Mock já despacha a fila.
- **Fase D**: NPS (`Survey`), indicação (`Referral`), clube (`Subscription` — cobrança = PAGO).

> Migrations NÃO aplicadas em prod (usuário aplica via `prisma migrate deploy`, EM ORDEM:
> `20260608020000_retention_lifecycle_enum` ANTES de `20260608030000_retention_lifecycle`).
> Verificação funcional no Neon (`.env.test`) pendente.
