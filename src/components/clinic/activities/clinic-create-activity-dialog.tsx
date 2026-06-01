'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClinicActivityAction } from '@/domains/clinic/activities/activity-actions'
import { PRIORITY_LABEL, TYPE_LABEL } from '@/components/shared/activities/types'

import { ActivityTargetPicker, type ActivityTarget } from './activity-target-picker'

/**
 * Dialog de nova atividade do DOMÍNIO CLÍNICA. Espelha o admin, mas: sem
 * seletor de clínica (clientId é forçado pela sessão) e usa a action de
 * clínica. Fan-out "Todos" = membros da própria clínica.
 *
 * Item 1: toda atividade de clínica é sobre um lead/paciente. `presetTarget`
 * (item 6 — criada de dentro do card) trava o alvo e esconde o picker.
 */
type Option = { id: string; name: string }

type Props = {
  members: Option[]
  defaultAssigneeId?: string
  allowFanOut?: boolean
  activityCalendarSync?: 'AUTO' | 'ASK' | 'NEVER'
  /** Alvo fixo (card do cliente). Quando setado, esconde o picker. */
  presetTarget?: ActivityTarget
  /** Render alternativo do gatilho (ex.: botão menor dentro do card). */
  trigger?: React.ReactNode
  /** Chamado após criar com sucesso (além do router.refresh padrão). */
  onCreated?: () => void
}

export function ClinicCreateActivityDialog({
  members,
  defaultAssigneeId,
  allowFanOut,
  activityCalendarSync = 'ASK',
  presetTarget,
  trigger,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const initialAssignee = defaultAssigneeId || members[0]?.id || ''

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<keyof typeof TYPE_LABEL>('TASK')
  const [priority, setPriority] = useState<keyof typeof PRIORITY_LABEL>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [assignedToId, setAssignedToId] = useState<string>(initialAssignee)
  const [addToCalendar, setAddToCalendar] = useState(false)
  const [target, setTarget] = useState<ActivityTarget | null>(presetTarget ?? null)

  function reset() {
    setTitle('')
    setDescription('')
    setType('TASK')
    setPriority('MEDIUM')
    setDueDate('')
    setDueTime('')
    setAssignedToId(initialAssignee)
    setAddToCalendar(false)
    setTarget(presetTarget ?? null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) {
      toast.error('Selecione o lead ou paciente da atividade')
      return
    }
    startTransition(async () => {
      const res = await createClinicActivityAction({
        title,
        description: description || undefined,
        type,
        priority,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        assignedToId: assignedToId || null,
        addToCalendar: activityCalendarSync === 'ASK' ? addToCalendar : undefined,
        targetType: target.type,
        targetId: target.id,
      })
      if (res.success) {
        toast.success('Atividade criada')
        setOpen(false)
        reset()
        router.refresh()
        onCreated?.()
      } else {
        toast.error(res.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-1 h-4 w-4" /> Nova atividade
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova atividade</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {/* Item 1: alvo obrigatório. Se veio do card (presetTarget), trava. */}
          <div className="space-y-1">
            <Label>Relacionada a</Label>
            {presetTarget ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {presetTarget.type === 'lead' ? 'Lead' : 'Paciente'}:{' '}
                <span className="font-medium">{presetTarget.name}</span>
              </div>
            ) : (
              <ActivityTargetPicker value={target} onChange={setTarget} disabled={pending} />
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dueDate">Vencimento</Label>
              <DateInput
                id="dueDate"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dueTime">Hora</Label>
              <Input
                id="dueTime"
                type="time"
                lang="pt-BR"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
              />
            </div>
          </div>

          {(members.length > 1 || allowFanOut) && (
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowFanOut && <SelectItem value="all">Todos</SelectItem>}
                  {members.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {activityCalendarSync === 'ASK' && (
            <label className="inline-flex cursor-pointer select-none items-center gap-2 pt-1 text-sm text-foreground">
              <input
                type="checkbox"
                checked={addToCalendar}
                onChange={(e) => setAddToCalendar(e.target.checked)}
                disabled={pending}
                className="h-4 w-4 cursor-pointer accent-emerald-500"
              />
              Adicionar ao calendário
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !title.trim() || !target}>
              {pending ? 'Salvando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
