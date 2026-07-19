'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { TimeInput } from '@/components/ui/time-input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  createClinicCalendarEventAction,
  deleteClinicCalendarEventAction,
  updateClinicCalendarEventAction,
} from '@/domains/clinic/calendar/calendar-event-actions'
import { ColorPicker } from '@/components/shared/calendar/color-picker'
import type { CalendarEvent } from '@/server/queries/calendar-queries'

/**
 * Dialog de evento do DOMÍNIO CLÍNICA (Fase 4). Espelha o admin
 * (modules/calendar/event-dialog) mas usa as actions de clínica — escopo
 * clientId. Evento ligado a atividade é read-only (sincroniza via Atividades).
 */
type Props =
  | { mode: 'create'; open: boolean; onOpenChange: (open: boolean) => void; onChanged?: () => void }
  | {
      mode: 'edit'
      open: boolean
      event: CalendarEvent | null
      onOpenChange: (open: boolean) => void
      onChanged?: () => void
    }

const SP_DATE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const SP_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function toLocalDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return SP_DATE.format(date)
}
function toLocalTime(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return SP_TIME.format(date)
}

export function ClinicEventDialog(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const editing = props.mode === 'edit' ? props.event : null
  const isLinkedActivity = editing?.activityId != null

  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [color, setColor] = useState('')
  const [category, setCategory] = useState('')
  // Recorrência (item 7) — só no create.
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'monthly'>('none')
  const [repeatUntil, setRepeatUntil] = useState('')

  useEffect(() => {
    if (!props.open) return
    if (props.mode === 'edit' && props.event) {
      const e = props.event
      setTitle(e.title)
      setStartDate(toLocalDate(e.start))
      setStartTime(toLocalTime(e.start))
      setEndDate(toLocalDate(e.end))
      setEndTime(toLocalTime(e.end))
      setNotes(e.notes ?? '')
      setColor(e.color ?? '')
      setCategory(e.category ?? '')
    } else {
      const today = SP_DATE.format(new Date())
      setTitle('')
      setStartDate(today)
      setStartTime('')
      setEndDate('')
      setEndTime('')
      setNotes('')
      setColor('')
      setCategory('')
      setRepeat('none')
      setRepeatUntil('')
    }
  }, [props.open, props.mode, props.mode === 'edit' ? props.event?.id : null])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startDate) {
      toast.error('Título e data inicial são obrigatórios')
      return
    }
    startTransition(async () => {
      const payload = {
        title: title.trim(),
        startDate,
        startTime: startTime || undefined,
        endDate: endDate || undefined,
        endTime: endTime || undefined,
        notes: notes.trim() || undefined,
        color: color || undefined,
        category: category.trim() || undefined,
        ...(props.mode === 'create' && repeat !== 'none'
          ? { repeat, repeatUntil: repeatUntil || undefined }
          : {}),
      }
      const res =
        props.mode === 'edit' && editing
          ? await updateClinicCalendarEventAction(editing.id, payload)
          : await createClinicCalendarEventAction(payload)
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      const created = res.data && 'count' in res.data ? res.data.count : 1
      toast.success(
        props.mode === 'edit'
          ? 'Evento atualizado'
          : created > 1
            ? `${created} eventos criados`
            : 'Evento criado'
      )
      props.onOpenChange(false)
      props.onChanged?.()
      router.refresh()
    })
  }

  function handleDelete() {
    if (!editing) return
    const isSeries = editing.recurrenceGroupId != null
    let scope: 'one' | 'series' = 'one'
    if (isSeries) {
      // Série: pergunta se exclui só esta ocorrência ou todas de uma vez (item 7).
      const all = confirm(
        'Este evento faz parte de uma série recorrente.\n\nOK = excluir TODA a série.\nCancelar = escolher excluir só este.'
      )
      if (all) {
        scope = 'series'
      } else {
        if (!confirm('Excluir apenas esta ocorrência?')) return
        scope = 'one'
      }
    } else {
      if (!confirm('Excluir este evento?')) return
    }
    startTransition(async () => {
      const res = await deleteClinicCalendarEventAction(editing.id, scope)
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success(scope === 'series' ? 'Série removida' : 'Evento removido')
      props.onOpenChange(false)
      props.onChanged?.()
      router.refresh()
    })
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.mode === 'edit' ? 'Editar evento' : 'Novo evento'}</DialogTitle>
        </DialogHeader>

        {isLinkedActivity && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            Este evento foi gerado pela atividade vinculada. Edite o título ou data direto em
            Atividades — as alterações sincronizam automaticamente.
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cevent-title">Título</Label>
            <Input
              id="cevent-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLinkedActivity}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cevent-start-date">Início</Label>
              <DateInput
                id="cevent-start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isLinkedActivity}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cevent-start-time">Hora início</Label>
              <TimeInput
                id="cevent-start-time"
                lang="pt-BR"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isLinkedActivity}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cevent-end-date">Fim (opcional)</Label>
              <DateInput
                id="cevent-end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isLinkedActivity}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cevent-end-time">Hora fim</Label>
              <TimeInput
                id="cevent-end-time"
                lang="pt-BR"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={isLinkedActivity}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cevent-notes">Notas (opcional)</Label>
            <textarea
              id="cevent-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLinkedActivity}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cor (opcional)</Label>
            <ColorPicker value={color} onChange={setColor} disabled={isLinkedActivity} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cevent-category">Categoria (opcional)</Label>
            <Input
              id="cevent-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Pessoal, Reunião"
              disabled={isLinkedActivity}
            />
          </div>

          {/* Recorrência (item 7) — só na criação. */}
          {props.mode === 'create' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Repetir</Label>
                <Select value={repeat} onValueChange={(v) => setRepeat(v as typeof repeat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não repete</SelectItem>
                    <SelectItem value="weekly">Toda semana</SelectItem>
                    <SelectItem value="monthly">Todo mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {repeat !== 'none' && (
                <div className="space-y-1">
                  <Label htmlFor="cevent-repeat-until">Repetir até</Label>
                  <DateInput
                    id="cevent-repeat-until"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          {props.mode === 'create' && repeat !== 'none' && (
            <p className="text-xs text-muted-foreground">
              Cria ocorrências {repeat === 'weekly' ? 'semanais' : 'mensais'} até a data escolhida
              (máx. 1 ano). Excluir depois remove a série inteira de uma vez.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {props.mode === 'edit' && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={pending}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Excluir
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancelar
            </Button>
            {!isLinkedActivity && (
              <Button type="submit" disabled={pending || !title.trim() || !startDate}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {props.mode === 'edit' ? 'Salvar' : 'Criar'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
