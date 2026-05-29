'use client'

import { Plus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createActivityAction } from '@/server/actions/activity-actions'

import { PRIORITY_LABEL, TYPE_LABEL } from '@/components/shared/activities/types'

type Option = { id: string; name: string }

type Props = {
  clients: Option[]
  users: Option[]
  defaultClientId?: string | null
  /** Quando true, o usuário não escolhe clínica (CLIENT_OWNER/STAFF). */
  lockClient?: boolean
  /** Pré-seleciona o responsável (pasta do admin). */
  defaultAssigneeId?: string
  /** Habilita a opção "Todos os usuários" (fan-out). Apenas ADMIN. */
  allowFanOut?: boolean
  /** Pref do criador sobre sync com calendário pessoal. */
  activityCalendarSync?: 'AUTO' | 'ASK' | 'NEVER'
}

export function CreateActivityDialog({
  clients,
  users,
  defaultClientId,
  lockClient,
  defaultAssigneeId,
  allowFanOut,
  activityCalendarSync = 'ASK',
}: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const initialAssignee = defaultAssigneeId || users[0]?.id || ''

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<keyof typeof TYPE_LABEL>('TASK')
  const [priority, setPriority] = useState<keyof typeof PRIORITY_LABEL>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [clientId, setClientId] = useState<string>(defaultClientId ?? 'none')
  const [assignedToId, setAssignedToId] = useState<string>(initialAssignee)
  const [addToCalendar, setAddToCalendar] = useState(false)

  function reset() {
    setTitle('')
    setDescription('')
    setType('TASK')
    setPriority('MEDIUM')
    setDueDate('')
    setDueTime('')
    setClientId(defaultClientId ?? 'none')
    setAssignedToId(initialAssignee)
    setAddToCalendar(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createActivityAction({
        title,
        description: description || undefined,
        type,
        priority,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        clientId: clientId === 'none' ? null : clientId,
        assignedToId: assignedToId || null,
        addToCalendar: activityCalendarSync === 'ASK' ? addToCalendar : undefined,
      })
      if (res.success) {
        toast.success('Atividade criada')
        setOpen(false)
        reset()
        router.refresh()
      } else {
        toast.error(res.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> Nova atividade
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova atividade</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
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

          {!lockClient && clients.length > 0 && (
            <div className="space-y-1">
              <Label>Clínica</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma (geral)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geral (sem clínica)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(users.length > 1 || allowFanOut) && (
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowFanOut && <SelectItem value="all">Todos</SelectItem>}
                  {users.map((u) => (
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
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? 'Salvando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
