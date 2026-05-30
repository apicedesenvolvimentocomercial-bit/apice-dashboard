# Pipelines variáveis — Progresso

Funis configuráveis por clínica (≤6) substituindo o antigo par fixo
NEW/EXISTING. Ledger faseado.

## Decisões (sessão 2026-05-28)

- **Fase 1 = só estrutura** (esta sessão). Funções de negócio (agenda/financeiro/
  KPI/webhooks/cron de inatividade) = Fase 2.
- Máx. **6 pipelines** por clínica (contando as 2 nativas).
- **Nativas só na 1ª pipeline padrão** (COMMERCIAL). Pipelines CUSTOM = livres.
- Switcher = **abas dinâmicas + botão "+"**. Gestão de pipeline (renomear/excluir)
  reaproveita o dialog "Editar etapas" (agora "Editar pipeline").
- Inatividade da RETENTION = **configurável pela clínica** (default 30d) — Fase 2.
- Ingest automático de Lead (landing/WhatsApp) = **adiado** (Fase 2). Já existe
  rota `/api/webhooks/[provider]` no app — ponto de partida.

## Modelo (Fase 1 — FEITO)

Migration `20260528180000_variable_pipelines`:

- Novo enum `PipelineKind { COMMERCIAL, RETENTION, CUSTOM }`.
- Nova tabela **`Pipeline`** (id, organizationId desnorm, clientId, name, kind,
  order). `@@unique([clientId, order])`. RLS habilitada (entrou na lista —
  `prompt/rls-gambiarra.md`).
- `PipelineStage`: removido `kind StageKind`; adicionado **`pipelineId`** (FK
  cascade) + **`isNative Boolean`**. Unique passa a `(pipelineId, order)`. Enum
  `StageKind` dropado.
- Migração de dados: cada (clientId, kind) virou uma Pipeline — NEW→COMMERCIAL
  (order 0), EXISTING→RETENTION (order 1). Stages relinkadas por `pipelineId`.
  Stages seed das nativas marcadas `isNative=true` (COMMERCIAL: Lead/Agendado/
  Compareceu/Fechado(isWon)/No-show(isLost); RETENTION: Ativo/Inativo — "Em
  tratamento" fica livre).

**Invariante** `Pipeline.organizationId == client.organizationId` mantida só pelo
código (mesmo padrão dos outros modelos operacionais — ver CLAUDE.md).

## Camadas (Fase 1 — FEITO)

- `pipeline-repository.ts` (novo): `listPipelines`, `createPipeline` (bloqueia em
  `MAX_PIPELINES=6`), `renamePipeline`, `deletePipeline` (bloqueia nativas + com
  leads), `ensureNativePipelines` (idempotente, cria Comercial+Retenção com etapas
  nativas). Constantes `COMMERCIAL_NATIVE_STAGES` / `RETENTION_NATIVE_STAGES`.
- `pipeline-stage-repository.ts`: `kind`→`pipelineId`; `deleteStage` bloqueia
  `isNative`; escopo de org via `pipeline.organizationId`.
- `lead-repository.ts`: `getPipeline(ctx, clientId, pipelineId)` (era `kind`);
  select agora traz `isNative`; `listPatientsWithoutExistingCard` usa
  `stage.pipeline.kind === 'RETENTION'`.
- `lead-queries.ts`: `getPipelineData(clientId, pipelineId)`, `listClinicPipelines`,
  `getClinicPipelinesWithStages` (carrega ≤6 funis + etapas de uma vez p/ SSR).
- `client-service.createDefaultPipelineStages(clientId, organizationId)` → delega a
  `ensureNativePipelines`. Caller em `client-actions.ts` passa `ctx.organizationId`.
- `pipeline-actions.ts` (novo): create/rename/delete pipeline. `pipeline-stage-actions.ts`:
  `kind`→`pipelineId`; mensagem de etapa nativa.
- `dashboard-queries.ts`: funil do dashboard fixado em `pipeline.kind === 'COMMERCIAL'`
  (preserva comportamento pré-multipipeline).
- Audit: entityType `Pipeline` adicionado.
- Seeds: `seed-lucorreia.ts` cria as 2 nativas. `seed.ts`/`seed-e2e.ts` não semeiam
  pipeline → cobertos pela semeadura lazy em `getClinicPipelinesWithStages`.

## UI (Fase 1 — FEITO)

- `pipeline-tabs.tsx`: abas dinâmicas (uma por Pipeline) + botão "+" cria CUSTOM
  (limite 6). **Bug de altura corrigido** — toda `TabsContent` usa as mesmas
  classes flex (`mt-0 flex min-h-0 flex-1 flex-col gap-4`), então o funil de
  cadastrados não cai mais ao rodapé.
- `kanban-board.tsx`: props `kind`→`pipelineId`+`pipelineKind`+`pipelineName`. O
  branch de adicionar paciente usa `pipelineKind === 'RETENTION'`.
- `stage-editor-dialog.tsx`: "Editar pipeline" — renomeia a pipeline, exclui se
  CUSTOM; etapas nativas mostram cadeado (sem botão excluir).
- Páginas `/(clinic)/crm` e `/(admin)/clients/[id]/crm`: carregam pipelines via
  loader e passam `pipelines` ao `PipelineTabs`.

Verificado: `type-check` ✓ · `lint` ✓ (0 erros) · `test` ✓ (131) · `build` ✓.
**Migration NÃO aplicada em prod** (usuário aplica via `prisma migrate deploy`).

## Fase 2 — lógica de negócio (entrega sub-fase por sub-fase, validada no Neon)

Plano completo: `~/.claude/plans/sorted-scribbling-aho.md`. Decisões travadas:
KPI de comparecimento/no-show vem do `Appointment.status` (reusa KPI existente, sem
métrica nova); Agendado abre dialog **bloqueante** e converte o lead em Patient;
etapas livres entre nativas **não** têm efeito.

### Fase 2.0 — fundação — FEITO

Migration `20260529000000_pipeline_native_keys` (sem tabela nova → RLS inalterada):

- Enum **`StageNativeKey`** (LEAD/SCHEDULED/ATTENDED/CLOSED/NO_SHOW/ACTIVE/INACTIVE)
  - coluna **`PipelineStage.nativeKey`** (null = etapa livre). Backfill das nativas
    por (pipeline.kind, isWon/isLost/order). É a identidade ESTÁVEL da etapa — o
    código decide o efeito por aqui, nunca pelo nome (renomeável).
- **`Lead.appointmentId`** (`@unique`, FK SET NULL) + relação inversa `Appointment.lead`.
  Liga o card ao agendamento que ele gerou (usado por Fechado/retrocesso).
- Constantes nativas (`pipeline-repository`) + `seed-lucorreia` gravam `nativeKey`.
- `getPipeline` select + `KanbanStage` type ganham `nativeKey`.
- **Ordem fixa das nativas**: `reorderStages` rejeita (retorna `{ok:false}`) qualquer
  ordem que quebre o rank canônico da subsequência nativa; a action vira `fail`. O
  editor desabilita as setas das etapas nativas.

### Fase 2a — Agendado — FEITO

- **Novo** `src/server/services/pipeline-stage-effects.ts`:
  `scheduleLeadAppointment(ctx, {leadId, stageId, procedureId, scheduledAt, ...})`
  em transação única — garante Patient (`ensurePatientForLead`), cria Appointment
  (status SCHEDULED), liga `Lead.appointmentId`+`patientId`+`scheduledAt`+etapa,
  registra `LeadInteraction` (MEETING).
- **Nova action** `scheduleLeadAction` (`lead-actions.ts`): valida com zod, exige
  `crm:write` **e** `appointments:write`, parse de data via helpers extraídos p/
  `src/lib/date.ts` (`parseScheduledAt`, `isTooOldToSchedule` — appointment-actions
  agora reusa os mesmos).
- **Novo** `src/modules/crm/schedule-lead-dialog.tsx`: dialog **bloqueante**
  (procedimento + data/hora + duração). Cancelar/fechar = reverte o card.
- `kanban-board.tsx`: `handleDragEnd` intercepta move→etapa SCHEDULED (de origem ≠
  Agendado) e abre o dialog em vez de persistir; só grava ao confirmar. `procedures`
  threaded pelas páginas (`getProceduresForScheduling`, gateado por `crm:read`).
- `kanban-column.tsx`: esconde o "+" nas etapas SCHEDULED/ATTENDED (proíbe criar
  card direto em Agendado/Compareceu).

Verificado 2.0+2a: `type-check` ✓ · `lint` ✓ (0 erros) · `test` ✓ (131) · `build` ✓.
Provado no Neon (`migrate:test` + script tsx): backfill de nativeKey correto;
scheduleLeadAppointment cria Appointment+Patient e liga ao card; trava de
reordenação rejeita SCHEDULED antes de LEAD e aceita a ordem canônica.
**Migration NÃO aplicada em prod.**

### Fase 2b–2f — FEITO

Choke point único: `moveLeadAction` → `moveLeadWithEffect` (em
`pipeline-stage-effects.ts`) decide o efeito pelo `nativeKey` da etapa destino e
detecta retrocesso. Retorna um payload de status (`moved` / `needs-appointment` /
`confirm-regress` / `confirm-close-early`) que o `kanban-board` interpreta.

- **2b Compareceu/No-show**: move→ATTENDED/NO_SHOW marca o Appointment
  (`status`+`attendedAt`/`noShowAt`) ligado via `Lead.appointmentId`; sem appointment
  → `needs-appointment` (toast "agende antes", reverte). KPIs derivam do status, sem
  métrica nova.
- **2c Fechado**: exige `Lead.appointmentId`; se `scheduledAt` no futuro →
  `confirm-close-early` (AlertDialog; confirmar re-chama com `force`). Marca ATTENDED
  se preciso + cria Revenue do procedimento (idempotente por `appointmentId`).
- **2d Retrocesso**: `moveLeadWithEffect` detecta rank destino < origem →
  `confirm-regress` (AlertDialog). `regressLeadAction`→`regressLeadStage` desfaz por
  FAIXA (rank destino..origem): rank≥3 remove Revenue+closedAt; rank≥2 volta
  Appointment p/ SCHEDULED; rank≥1 soft-delete do Appointment + limpa vínculo. Tudo
  em transação. (Bug pego no Neon: undo precisa ser por faixa, não só pela origem —
  corrigido.)
- **2e RETENTION**: `Client.inactivityDays` (default 30, migration
  `20260529120000`). Cron `api/cron/retention` + `retention-job.ts` (cross-clínica,
  GUC nula = exceção legítima): garante pipeline RETENTION, cria card ACTIVE p/ todo
  paciente sem card, move p/ INACTIVE quem ficou >N dias sem Appointment ATTENDED nem
  Revenue. Registrado em `vercel.json` (07:00 diário). Idempotente.
- **2f Webhook Lead**: `api/webhooks/[provider]` (POST) + `lead-ingest.ts`. Contrato:
  `{ clientId, name, phone?, email?, procedureInterest? }`. Provider→source
  (meta-ads→META_ADS, google-ads→GOOGLE_ADS, whatsapp→WHATSAPP). Cria Lead na etapa
  `nativeKey=LEAD` da pipeline COMMERCIAL. **`enterClientScope(clientId)` ANTES** de
  tocar dados (rota não passa por getClinicContext). Fail-closed por `WEBHOOK_SECRET`
  já existente.

Verificado 2b–2f: `type-check` ✓ · `lint` ✓ (0 erros) · `test` ✓ (131) · `build` ✓.
Provado no Neon (scripts tsx): fluxo schedule→attended→closed cria/baixa Revenue;
retrocesso desfaz por faixa (Revenue removido, Appointment soft-deletado);
no-show sem agendamento bloqueado; webhook whatsapp ingere na etapa LEAD com source
correto e rejeita provider inválido; retention job (contexto admin) ativa/desativa e
é idempotente. **3 migrations Fase 2 NÃO aplicadas em prod** (`pipeline_native_keys`,
`client_inactivity_days`; + as 2 da Fase 1).

### Variáveis de ambiente / deploy

- `WEBHOOK_SECRET` (header `x-webhook-secret`) p/ o webhook 2f aceitar POST.
- Cron `api/cron/retention` usa `CRON_SECRET` como os demais (ver `lib/cron-auth`).
- Aplicar em prod, em ordem: `variable_pipelines`, `pipeline_native_keys`,
  `client_inactivity_days` (via `prisma migrate deploy`).

## Fase 3 — fluxo Compareceu + link agenda↔pipeline (sessão 2026-05-30) — FEITO

**SEM migration** — reusa campos existentes (`Patient.birthDate`/`cpf`,
`Appointment.cancelReason`, `Lead.lostReason`/`deletedAt`/`appointmentId`).

- **feat1 — Compareceu completa o cadastro + trava o fechamento.**
  - Novo `attend-lead-dialog.tsx` (bloqueante) + `attendLeadAction` +
    `attendLeadWithPatientData` (em `pipeline-stage-effects`): exige os 5 campos
    (nome/telefone/nascimento/email/cpf), atualiza o Patient (`fromScheduledLead=false`)
    e marca o Appointment `ATTENDED`. Board intercepta move→ATTENDED (origem ≠
    ATTENDED/CLOSED) e abre o dialog.
  - `moveLeadWithEffect` branch CLOSED agora **exige `appointment.status==='ATTENDED'`**
    (retorna `not-attended`); removidos o auto-mark de ATTENDED e o fluxo `close-early`
    (estado/dialog/`force` saíram do board, da action e do tipo `MoveEffectResult`).
  - `createPatientAction` usa `createPatientSchema` (5 campos obrigatórios);
    `create-patient-dialog` valida-os. Atalho "Ganhou" REMOVIDO do `lead-drawer`
    (burlava o fluxo) — `winLead`/`winLeadAction` permanecem no código, sem caller de UI.
- **feat5 — Cancelamento exige motivo.** Novo `cancel-lead-dialog.tsx`; board intercepta
  move→NO_SHOW (forward; CLOSED→NO_SHOW continua retrocesso). Motivo vai em
  `moveLeadAction(..., cancelReason)` → `Appointment.cancelReason` + `Lead.lostReason`.
- **feat2 — Excluir agendamento de pipeline retrocede ao LEAD.** `regressAppointmentToLead`
  (+ `regressAppointmentToLeadAction`) acha o card pelo `appointmentId`, encontra a etapa
  `nativeKey=LEAD` da mesma pipeline e chama `regressLeadStage` (soft-deleta o Appointment).
  `appointment-detail-dialog` mostra AlertDialog "retrocederá para Lead" quando há card ativo;
  sem card = soft-delete normal.
- **feat4 — Lead excluído pisca na agenda.** `listAppointments` traz `lead:{id,deletedAt}`;
  `AppointmentEvent.lead`; `calendar-view` aplica classe `fc-event-lead-deleted` (keyframes
  em `globals.css`) + título de aviso; banner no detalhe.
- **feat3 — Card de Retenção atrelado ao Patient.** `lead-drawer` recebe `pipelineKind` e em
  RETENTION esconde remover/ganhar/perder. `deletePatientAction` chama
  `removeRetentionCardForPatient` (soft-delete só dos cards de retenção do paciente).
- **Visão (escopo: paciente existente) — agendamento manual espelha card.**
  `syncPipelineCardForManualAppointment` (best-effort em `createAppointmentAction`):
  paciente real (`!fromScheduledLead` OU Appointment ATTENDED OU já tem card RETENTION) →
  garante card de Retenção em ATIVO; provisório/novo → card Comercial em Agendado ligado ao
  Appointment (reusa card comercial existente sem clobber de `appointmentId @unique`).
  Dialog de agendamento segue só com pacientes existentes (cadastrar pessoa nova = adiado).
- **feat6 — Busca global nas pipelines.** `KanbanLead`/`getPipeline` ganham `email`; novo
  `pipeline-search.tsx` acima das abas filtra em memória (nome/telefone/email) todos os ≤6
  funis já carregados no SSR; clicar troca de aba e destaca o card (`highlightLeadId`
  propagado Tabs→Board→Column→Card, ring temporário + scrollIntoView).
- **fix — cinza da agenda dark-safe.** `calendar-view` troca cor inline (`#e2e8f0`/`#cbd5e1`)
  por classes `fc-bg-holiday`/`fc-bg-closed` pintadas por token (`hsl(var(--muted/--primary))`)
  em `globals.css` — cascateia no dark sem ficar claro demais.

Verificado: `type-check` ✓ · `lint` ✓ (0 erros) · `test` ✓ (139) · `build` ✓.
Verificação funcional pendente no Neon/manual (sem migration nova a aplicar).

## Fase 4 — integração reversa agenda→pipeline COMPLETA (sessão 2026-05-30) — FEITO

Antes a direção agenda→pipeline só cobria criar (espelha card) e excluir (retrocede)
agendamento. Os DESFECHOS registrados na agenda (comparecer/faltar/cancelar/remarcar/
baixa financeira) não tocavam o card ligado → dessincronização (pior caso: baixa pela
agenda não setava `Lead.closedAt`, logo não contava como conversão). Agora os dois lados
ficam sempre em sincronia. **SEM migration** (reusa campos existentes).

Núcleo em `pipeline-stage-effects.ts` (novas funções, acham o card pelo `appointmentId` e
movem para a etapa nativa do PRÓPRIO funil; custom pipelines sem a etapa são ignoradas;
todas em `scopedTransaction`, `clientId` no `where`):

- **`attendAppointment`** — Compareceu pela agenda. Completa o paciente (5 campos,
  `fromScheduledLead=false`), marca o Appointment ATTENDED e move o card→Compareceu
  (ATTENDED). Espelha `attendLeadWithPatientData`. Action `attendAppointmentAction`
  (gate `appointments:write` + `patients:write`); UI: novo `attend-appointment-dialog.tsx`
  (bloqueante, pré-preenche os 5 campos via `getPatientAction`). O botão "Compareceu" do
  `appointment-detail-dialog` abre esse dialog (não mais status flip direto); ao confirmar,
  segue para o prompt de receita.
- **`cancelAppointmentSync`** — Faltou/Cancelar pela agenda. Atualiza o status do Appointment
  (NO_SHOW = entra na média; CANCELED = fora) + move o card→Cancelado (NO_SHOW) gravando o
  motivo em `Lead.lostReason`. Usado por `updateAppointmentStatusAction` quando o status é
  NO_SHOW/CANCELED (Faltou sem motivo → motivo padrão "Faltou").
- **`closeAppointmentCard`** — após a baixa (`confirmRevenueFromAppointmentAction`), move o
  card→Fechado (CLOSED) e seta `closedAt` (marcador durável de conversão). Best-effort:
  não falha a baixa se o card desincronizar.
- **`syncLeadScheduledAt`** — remarcar pela agenda propaga a nova data ao `Lead.scheduledAt`
  do card ligado (best-effort em `updateAppointmentAction`).

**Conflito ATTENDED × Cancelado (decisão do produto):** o PRIMEIRO desfecho registrado é a
verdade; a agenda protege naturalmente (ATTENDED vira terminal → some o botão cancelar). No
funil, arrastar um card de Compareceu→Cancelado abre o `CancelLeadDialog` com um AVISO
amigável (`wasAttended`, banner âmbar) de que cancelar desfaz o comparecimento/baixa já
registrados — não bloqueia, só alerta antes de confirmar.

**Criar LEAD NOVO pela agenda (antes adiado).** O `create-appointment-dialog` ganhou um toggle
"Paciente existente | Novo lead". No modo novo lead: nome (obrigatório), telefone, e-mail,
origem, procedimento de interesse (= procedimento do agendamento) e observações; data/duração
vêm do slot/procedimento (mesmas validações de expediente/passado/futuro distante). Submete em
`createScheduledLeadFromAgendaAction` → `createLeadScheduledFromAgenda` (em
`pipeline-stage-effects`, transação única): cria Lead na etapa **Agendado** do funil COMERCIAL,
Patient provisório (`fromScheduledLead=true`) e Appointment SCHEDULED, todos ligados. Espelho de
`scheduleLeadAppointment` sem leadId prévio. Fix junto: o dialog agora sincroniza a data com o
slot clicado a cada abertura (antes a data do 1º clique "grudava").

**Consequência de permissão:** marcar Compareceu pela agenda agora exige `patients:write`
(antes só `appointments:write`), porque completa o cadastro do paciente — consistente com o
`attendLeadAction` da pipeline.

Verificado: `type-check` ✓ · `lint` ✓ (0 erros) · `test` ✓ (139) · `build` ✓. Verificação
funcional pendente no Neon/manual (sem migration nova).
