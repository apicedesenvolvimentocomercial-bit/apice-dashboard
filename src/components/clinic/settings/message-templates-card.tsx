'use client'

import type { OperationMode } from '@prisma/client'
import { ListTodo, Send } from 'lucide-react'
import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  setOperationModeAction,
  updateMessageTemplateAction,
} from '@/server/actions/message-actions'
import type { MessageTemplateRow, OutboundMessageRow } from '@/server/queries/messaging-queries'

type Props = {
  clientId: string
  operationMode: OperationMode
  templates: MessageTemplateRow[]
  recent: OutboundMessageRow[]
}

// Rótulos amigáveis por chave de template (régua de retenção).
const TEMPLATE_LABELS: Record<string, string> = {
  'retention.post_care': 'Pós-procedimento (0–24h)',
  'retention.nurture': 'Nutrição (2–15 dias)',
  'retention.reactivation': 'Reativação (retorno atrasado)',
  'retention.winback': 'Salvamento / Inativos',
}

const STATUS: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: 'Na fila', cls: 'bg-muted text-muted-foreground' },
  SENT: {
    label: 'Enviada',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  FAILED: {
    label: 'Falhou',
    cls: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  },
  SKIPPED: { label: 'Ignorada', cls: 'bg-muted text-muted-foreground' },
  TASK: {
    label: 'Virou tarefa',
    cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
  },
}

export function MessageTemplatesCard({ clientId, operationMode, templates, recent }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Régua de retenção</CardTitle>
        <CardDescription>
          Toques enviados conforme o paciente avança no funil de retenção. Use{' '}
          <code className="text-xs">{'{{nome}}'}</code>,{' '}
          <code className="text-xs">{'{{procedimento}}'}</code> e{' '}
          <code className="text-xs">{'{{clinica}}'}</code> como variáveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ModeSelector clientId={clientId} mode={operationMode} />

        {templates.map((t) => (
          <TemplateEditor key={t.id} clientId={clientId} template={t} />
        ))}

        {recent.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Últimas mensagens da fila</h3>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Quando</th>
                    <th className="px-2 py-1.5 text-left font-medium">Paciente</th>
                    <th className="px-2 py-1.5 text-left font-medium">Mensagem</th>
                    <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((m) => {
                    const st = STATUS[m.status] ?? STATUS.QUEUED
                    return (
                      <tr key={m.id} className="border-t border-border">
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                          {formatDistanceToNow(new Date(m.sentAt ?? m.scheduledFor), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </td>
                        <td className="px-2 py-1.5">{m.patientName ?? '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {TEMPLATE_LABELS[m.templateKey] ?? m.templateKey}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={cn('rounded px-1.5 py-0.5', st.cls)}>{st.label}</span>
                          {m.error && (
                            <span className="ml-1 text-muted-foreground" title={m.error}>
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
          </div>
        )}
      </CardContent>
    </Card>
  )
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
      toast.success('Modo de operação atualizado!')
    })
  }

  const options: {
    value: OperationMode
    icon: typeof ListTodo
    title: string
    desc: string
    note?: string
  }[] = [
    {
      value: 'MANUAL',
      icon: ListTodo,
      title: 'Manual (tarefas)',
      desc: 'Cada toque da régua vira uma tarefa atrelada ao paciente, com a mensagem pronta para o time enviar à mão.',
    },
    {
      value: 'AUTOMATED',
      icon: Send,
      title: 'Automático (mensagens)',
      desc: 'A régua envia as mensagens sozinha pelo WhatsApp.',
      note: 'Requer integração do WhatsApp — em breve. Enquanto não, os toques caem como tarefa.',
    },
  ]

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Modo de operação</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const Icon = o.icon
          const active = current === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              disabled={isPending}
              aria-pressed={active}
              className={cn(
                'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-60',
                active
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon
                  className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')}
                />
                {o.title}
              </span>
              <span className="text-xs text-muted-foreground">{o.desc}</span>
              {o.note && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">{o.note}</span>
              )}
            </button>
          )
        })}
      </div>
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
      toast.success('Template salvo!')
    })
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">
          {TEMPLATE_LABELS[template.key] ?? template.key}
        </Label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Ativa
        </label>
      </div>
      <Input
        placeholder="Título (opcional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending || !dirty}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
