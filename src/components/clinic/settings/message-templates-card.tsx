'use client'

import type { OperationMode } from '@prisma/client'
import { ListTodo, MessageCircle, type LucideIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  setOperationModeAction,
  updateMessageTemplateAction,
} from '@/server/actions/message-actions'
import type { MessageTemplateRow, OutboundMessageRow } from '@/server/queries/messaging-queries'

import { SETTINGS_BTN_GHOST, SETTINGS_INPUT, SettingsSectionCard } from './section-card'

/**
 * Seção Régua de retenção — redesign Senno (Configurações-handoff §12).
 * Dois blocos: card "Modo de operação" (segmented SEM pílula, §12.1) e a
 * lista de modelos de mensagem em cards próprios (§12.2) — card inativo a
 * opacity .66, toggle switch com knob deslizante (§16.3), apelido + conteúdo
 * e "Salvar mensagem" ghost por card.
 *
 * Desvios documentados vs. protótipo:
 * - O modo real (`OperationMode`) tem 2 valores, não 3: MANUAL = "Por
 *   tarefas" (cada toque vira tarefa) e AUTOMATED = "Automático" (WhatsApp).
 *   Não existe modo "nenhuma ação" — os modelos aparecem sempre.
 * - São 4 modelos reais (pós/nutrição/reativação/salvamento) — o "Relembrar
 *   do agendamento" do protótipo não existe na régua (é evento de agenda).
 * - O toggle Ativa/Inativa não persiste sozinho: entra no "Salvar mensagem"
 *   do card (evita write por clique acidental).
 * - Mantida a tabela "Últimas mensagens da fila" (funcionalidade existente,
 *   fora do protótipo) num card próprio, com pills de status nos tokens.
 */

type Props = {
  clientId: string
  operationMode: OperationMode
  templates: MessageTemplateRow[]
  recent: OutboundMessageRow[]
}

// Rótulo + gatilho por chave de template (ordem = ciclo de vida do paciente).
const TEMPLATE_ORDER = [
  'retention.post_care',
  'retention.nurture',
  'retention.reactivation',
  'retention.winback',
]

const TEMPLATE_META: Record<string, { label: string; hint: string }> = {
  'retention.post_care': {
    label: 'Pós-procedimento',
    hint: 'Enviada de 0 a 24h após o procedimento',
  },
  'retention.nurture': {
    label: 'Nutrição',
    hint: 'Enviada de 2 a 15 dias após o procedimento',
  },
  'retention.reactivation': {
    label: 'Reativação',
    hint: 'Paciente com retorno atrasado',
  },
  'retention.winback': {
    label: 'Salvamento / inativos',
    hint: 'Última tentativa de retorno',
  },
}

const STATUS: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: 'Na fila', cls: 'bg-muted text-muted-foreground' },
  SENT: { label: 'Enviada', cls: 'bg-ok-bg text-ok' },
  FAILED: { label: 'Falhou', cls: 'bg-destructive/10 text-destructive' },
  SKIPPED: { label: 'Ignorada', cls: 'bg-muted text-muted-foreground' },
  TASK: { label: 'Virou tarefa', cls: 'bg-info-bg text-info-t' },
}

export function MessageTemplatesCard({ clientId, operationMode, templates, recent }: Props) {
  const ordered = [...templates].sort(
    (a, b) => TEMPLATE_ORDER.indexOf(a.key) - TEMPLATE_ORDER.indexOf(b.key)
  )

  return (
    <div className="flex flex-col gap-3.5">
      {/* ---- Card "Modo de operação" (§12.1) ---- */}
      <SettingsSectionCard
        title="Régua de retenção"
        description="Mantém pacientes ativos com follow-ups no momento certo."
      >
        <ModeSelector clientId={clientId} mode={operationMode} />
      </SettingsSectionCard>

      {/* ---- Modelos de mensagem (§12.2) ---- */}
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[13.5px] font-semibold">Modelos de mensagem</h3>
        <span className="text-xs text-muted-foreground">
          Use <code className="font-mono">{'{{nome}}'}</code>,{' '}
          <code className="font-mono">{'{{procedimento}}'}</code> e{' '}
          <code className="font-mono">{'{{clinica}}'}</code> como variáveis.
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {ordered.map((t) => (
          <TemplateEditor key={t.id} clientId={clientId} template={t} />
        ))}
      </div>

      {/* ---- Últimas mensagens da fila (funcionalidade existente) ---- */}
      {recent.length > 0 && (
        <SettingsSectionCard
          title="Últimas mensagens da fila"
          description="Os 30 envios mais recentes da régua, com o desfecho de cada um."
        >
          <div className="overflow-x-auto rounded-[11px] border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Quando</th>
                  <th className="px-3 py-2 text-left font-semibold">Paciente</th>
                  <th className="px-3 py-2 text-left font-semibold">Mensagem</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => {
                  const st = STATUS[m.status] ?? STATUS.QUEUED
                  return (
                    <tr key={m.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatDistanceToNow(new Date(m.sentAt ?? m.scheduledFor), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </td>
                      <td className="px-3 py-2">{m.patientName ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {TEMPLATE_META[m.templateKey]?.label ?? m.templateKey}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('rounded-full px-2 py-0.5 font-semibold', st.cls)}>
                          {st.label}
                        </span>
                        {m.error && (
                          <span className="ml-1.5 text-muted-foreground" title={m.error}>
                            ⚠
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SettingsSectionCard>
      )}
    </div>
  )
}

// Segmented sem pílula (§12.1 / §8.1) — 2 modos reais.
const MODES: { value: OperationMode; label: string; icon: LucideIcon }[] = [
  { value: 'MANUAL', label: 'Por tarefas', icon: ListTodo },
  { value: 'AUTOMATED', label: 'Automático', icon: MessageCircle },
]

const MODE_HELP: Record<OperationMode, string> = {
  MANUAL: 'O sistema cria tarefas para a equipe entrar em contato no momento certo.',
  AUTOMATED:
    'As mensagens abaixo são enviadas automaticamente pelo WhatsApp nos gatilhos definidos.',
}

function ModeSelector({ clientId, mode }: { clientId: string; mode: OperationMode }) {
  const [isPending, startTransition] = useTransition()
  const [current, setCurrent] = useState<OperationMode>(mode)

  function choose(next: OperationMode) {
    if (next === current || isPending) return
    const prev = current
    setCurrent(next) // otimista
    startTransition(async () => {
      const res = await setOperationModeAction(clientId, next)
      if (!res.success) {
        setCurrent(prev)
        toast.error(res.error.message)
        return
      }
      toast.success('Modo de operação atualizado')
    })
  }

  return (
    <div>
      <span className="mb-[9px] block text-xs font-semibold text-muted-foreground">
        Modo de operação
      </span>
      <div
        role="radiogroup"
        aria-label="Modo de operação"
        className="inline-flex gap-1.5 rounded-xl border border-border bg-muted p-[5px]"
      >
        {MODES.map(({ value, label, icon: Icon }) => {
          const active = current === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isPending}
              onClick={() => choose(value)}
              className={cn(
                'inline-flex h-9 items-center gap-[7px] rounded-[9px] px-[15px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70',
                active
                  ? 'bg-primary text-primary-foreground transition-[filter] hover:brightness-105'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>
      <p className="m-0 mt-[11px] text-[12.5px] leading-[1.55] text-muted-foreground">
        {MODE_HELP[current]}
      </p>
      {current === 'AUTOMATED' && (
        <p className="m-0 mt-1.5 text-xs leading-[1.55] text-warn">
          Requer a integração do WhatsApp — em breve. Enquanto não chega, os toques caem como
          tarefa.
        </p>
      )}
    </div>
  )
}

function TemplateEditor({
  clientId,
  template,
}: {
  clientId: string
  template: MessageTemplateRow
}) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(template.title ?? '')
  const [body, setBody] = useState(template.body)
  const [isActive, setIsActive] = useState(template.isActive)

  const meta = TEMPLATE_META[template.key] ?? { label: template.key, hint: '' }
  const dirty =
    title !== (template.title ?? '') || body !== template.body || isActive !== template.isActive

  function handleSave() {
    if (!body.trim()) {
      toast.error('Mensagem obrigatória')
      return
    }
    startTransition(async () => {
      const res = await updateMessageTemplateAction(clientId, template.id, {
        title: title.trim() || undefined,
        body: body.trim(),
        isActive,
      })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Modelo salvo')
    })
  }

  return (
    <div
      className={cn(
        'rounded-[13px] border border-border bg-card px-5 py-[18px] shadow-card transition-opacity',
        !isActive && 'opacity-[0.66]'
      )}
    >
      {/* Linha topo: label/hint + estado com toggle (§12.2) */}
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold">{meta.label}</div>
          {meta.hint && <div className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</div>}
        </div>
        <label className="inline-flex flex-none cursor-pointer items-center gap-2">
          <span
            className={cn(
              'text-xs font-semibold',
              isActive ? 'text-primary-text' : 'text-muted-foreground'
            )}
          >
            {isActive ? 'Ativa' : 'Inativa'}
          </span>
          {/* Toggle switch (§16.3): trilho 38×22, knob 16 desliza 16px. */}
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label={`${meta.label}: ${isActive ? 'ativa' : 'inativa'}`}
            onClick={() => setIsActive((v) => !v)}
            className={cn(
              'relative h-[22px] w-[38px] flex-none rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'border-primary bg-primary' : 'border-border bg-muted'
            )}
          >
            <span
              className={cn(
                'absolute left-0.5 top-0.5 h-4 w-4 rounded-full shadow-[0_1px_2px_hsl(var(--shadow)/0.25)] transition-transform',
                isActive ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0 bg-card'
              )}
              aria-hidden="true"
            />
          </button>
        </label>
      </div>

      {/* Grid de edição: apelido 220px + conteúdo (§12.2) */}
      <div className="mt-[15px] grid grid-cols-1 items-start gap-3.5 sm:grid-cols-[220px_1fr]">
        <div>
          <label
            htmlFor={`tpl-title-${template.id}`}
            className="mb-1.5 block text-[11.5px] font-semibold text-muted-foreground"
          >
            Apelido
          </label>
          <input
            id={`tpl-title-${template.id}`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex: sentimos sua falta"
            className={cn(SETTINGS_INPUT, 'h-[38px]')}
          />
        </div>
        <div>
          <label
            htmlFor={`tpl-body-${template.id}`}
            className="mb-1.5 block text-[11.5px] font-semibold text-muted-foreground"
          >
            Conteúdo da mensagem
          </label>
          <textarea
            id={`tpl-body-${template.id}`}
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva o conteúdo enviado ao paciente…"
            className="w-full resize-y rounded-[9px] border border-input bg-background px-3 py-[9px] text-[13.5px] leading-normal text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)]"
          />
        </div>
      </div>

      <div className="mt-[13px] flex justify-end">
        <button
          type="button"
          className={SETTINGS_BTN_GHOST}
          onClick={handleSave}
          disabled={isPending || !dirty}
        >
          {isPending ? 'Salvando…' : 'Salvar mensagem'}
        </button>
      </div>
    </div>
  )
}
