'use client'

import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { updateMessageTemplateAction } from '@/server/actions/message-actions'
import type { MessageTemplateRow, OutboundMessageRow } from '@/server/queries/messaging-queries'

type Props = {
  clientId: string
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
}

export function MessageTemplatesCard({ clientId, templates, recent }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mensagens automáticas (retenção)</CardTitle>
        <CardDescription>
          Régua enviada conforme o paciente avança no funil de retenção. Use{' '}
          <code className="text-xs">{'{{nome}}'}</code>,{' '}
          <code className="text-xs">{'{{procedimento}}'}</code> e{' '}
          <code className="text-xs">{'{{clinica}}'}</code> como variáveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
