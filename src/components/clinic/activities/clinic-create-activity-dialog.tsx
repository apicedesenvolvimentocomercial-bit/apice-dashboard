'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/ui/action-button'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { TimeInput } from '@/components/ui/time-input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createClinicActivityAction,
  createClinicActivityTypeAction,
  listClinicActivityTypesAction,
} from '@/domains/clinic/activities/activity-actions'
import { SAFE_TEXT_REGEX } from '@/lib/masks'
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
  // typeValue é um tipo nativo (chave do enum) OU `custom:<id>` p/ tipo da clínica.
  const [typeValue, setTypeValue] = useState<string>('TASK')
  // `open` controlado só p/ fechar o dropdown após criar um tipo no rodapé.
  const [typeOpen, setTypeOpen] = useState(false)
  const [customTypes, setCustomTypes] = useState<{ id: string; label: string }[]>([])
  const [newType, setNewType] = useState('')
  const [addingType, setAddingType] = useState(false)
  const [priority, setPriority] = useState<keyof typeof PRIORITY_LABEL>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [assignedToId, setAssignedToId] = useState<string>(initialAssignee)
  const [addToCalendar, setAddToCalendar] = useState(false)
  const [target, setTarget] = useState<ActivityTarget | null>(presetTarget ?? null)
  // Erro inline só depois do blur com conteúdo (padrão do create-appointment):
  // acusar "Título obrigatório" na primeira letra seria ruído.
  const [titleTouched, setTitleTouched] = useState(false)
  const [descTouched, setDescTouched] = useState(false)

  // Carrega os tipos personalizados da clínica ao abrir.
  useEffect(() => {
    if (!open) return
    listClinicActivityTypesAction().then((res) => {
      if (res.success) setCustomTypes(res.data)
    })
  }, [open])

  // Espelha o zod da action (`activitySchema`): min 2 / máx 255 (maxLength) /
  // texto seguro. Mensagens de UMA linha curta (ver `field-error.tsx`).
  const titleInvalidMsg = (() => {
    const t = title.trim()
    if (!t) return 'Título obrigatório'
    if (t.length < 2) return 'Mínimo 2 caracteres'
    if (!SAFE_TEXT_REGEX.test(t)) return 'Caracteres inválidos'
    return undefined
  })()
  const titleError = titleTouched ? titleInvalidMsg : undefined

  const descInvalidMsg =
    description.trim() && !SAFE_TEXT_REGEX.test(description) ? 'Caracteres inválidos' : undefined
  const descError = descTouched ? descInvalidMsg : undefined

  async function addCustomType() {
    const label = newType.trim()
    if (label.length < 2) return
    setAddingType(true)
    const res = await createClinicActivityTypeAction(label)
    setAddingType(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setCustomTypes((prev) => (prev.some((t) => t.id === res.data.id) ? prev : [...prev, res.data]))
    setTypeValue(`custom:${res.data.id}`)
    setNewType('')
    setTypeOpen(false) // recém-criado já vira o valor: fecha o dropdown.
  }

  function reset() {
    setTitle('')
    setDescription('')
    setTypeValue('TASK')
    setNewType('')
    setPriority('MEDIUM')
    setDueDate('')
    setDueTime('')
    setAssignedToId(initialAssignee)
    setAddToCalendar(false)
    setTarget(presetTarget ?? null)
    setTitleTouched(false)
    setDescTouched(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (titleInvalidMsg || descInvalidMsg) {
      setTitleTouched(true)
      setDescTouched(true)
      return
    }
    if (!target) {
      toast.error('Selecione o lead ou paciente da atividade')
      return
    }
    const isCustom = typeValue.startsWith('custom:')
    startTransition(async () => {
      const res = await createClinicActivityAction({
        title: title.trim(),
        // Vazio vira undefined: o zod é `.optional()`, mas '' reprovaria no
        // regex de caracteres (`+` exige ao menos 1 caractere).
        description: description.trim() || undefined,
        type: isCustom ? 'TASK' : typeValue,
        customTypeId: isCustom ? typeValue.slice('custom:'.length) : null,
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
          <ActionButton>
            <Plus aria-hidden="true" /> Nova atividade
          </ActionButton>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Nova atividade</DialogTitle>
        </DialogHeader>
        {/* `min-w-0`: o form é item do grid do DialogContent — sem isso, um
            conteúdo de linha única (ex.: lead de nome grande no picker) alarga
            a trilha inteira e o dialog estoura p/ fora dos limites. */}
        <form onSubmit={submit} className="min-w-0 space-y-3">
          {/* Cada campo tem a linha de erro RESERVADA (`reserve`): o erro
              aparece e some sem empurrar o resto do diálogo. */}
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => {
                if (e.target.value.trim()) setTitleTouched(true)
              }}
              aria-invalid={!!titleError}
              maxLength={255}
              autoFocus
            />
            <FieldError message={titleError} reserve />
          </div>

          {(members.length > 1 || allowFanOut) && (
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                {/* `bg-background` casa com o fundo do dialog — o `bg-popover`
                    padrão é mais claro no dark e destoava do popup. */}
                <SelectContent className="bg-background">
                  {allowFanOut && <SelectItem value="all">Todos</SelectItem>}
                  {members.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Slot só p/ ritmo — o select sempre tem valor válido. */}
              <FieldError reserve />
            </div>
          )}

          {/* Item 1: alvo obrigatório. Se veio do card (presetTarget), trava. */}
          <div className="space-y-2">
            <Label>Relacionada a</Label>
            {presetTarget ? (
              <div
                className="truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
                title={presetTarget.name}
              >
                {presetTarget.type === 'lead' ? 'Lead' : 'Paciente'}:{' '}
                <span className="font-medium">{presetTarget.name}</span>
              </div>
            ) : (
              <ActivityTargetPicker value={target} onChange={setTarget} disabled={pending} />
            )}
            {/* Sem validação própria (o botão fica desabilitado sem alvo). */}
            <FieldError reserve />
          </div>

          {/* Tipo + Prioridade — colunas SIMÉTRICAS (label + select + slot de
              erro). O criador de tipo personalizado vive no RODAPÉ do dropdown
              de Tipo (footer), então não desequilibra a altura das colunas. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                open={typeOpen}
                onOpenChange={setTypeOpen}
                value={typeValue}
                onValueChange={setTypeValue}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  // Largura FIXA na do trigger: sem isto o input largo do footer
                  // empurraria o dropdown p/ além do campo (o base só usa min-w).
                  className="w-[var(--radix-select-trigger-width)] bg-background"
                  footer={
                    /* Criar tipo personalizado (2–40 chars, teto do zod da
                       action). Fixo no rodapé do dropdown; os eventos ficam
                       contidos pelo wrapper do footer (ver select.tsx). */
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={newType}
                        onChange={(e) => setNewType(e.target.value)}
                        placeholder="Criar tipo personalizado…"
                        maxLength={40}
                        className="h-8 min-w-0 flex-1 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void addCustomType()
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Criar tipo"
                        onClick={() => void addCustomType()}
                        disabled={addingType || newType.trim().length < 2}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  }
                >
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                  {customTypes.length > 0 && <SelectSeparator />}
                  {customTypes.map((t) => (
                    <SelectItem key={t.id} value={`custom:${t.id}`}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError reserve />
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError reserve />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Vencimento</Label>
            {/* UM campo visual (como o "Data e hora" da agenda), mas por baixo
                seguem DOIS inputs: data sem hora continua valendo (a action
                trata hora ausente) e a hora só habilita com data preenchida. */}
            <div className="flex h-9 rounded-md border border-input shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
              <DateInput
                id="dueDate"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                containerClassName="h-full min-w-0 flex-1"
                className="h-full w-full rounded-none border-0 shadow-none focus-visible:ring-0"
              />
              <div className="h-5 w-px flex-none self-center bg-border" aria-hidden="true" />
              <TimeInput
                id="dueTime"
                lang="pt-BR"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
                containerClassName="h-full w-28 flex-none"
                className="h-full w-full rounded-none border-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <FieldError reserve />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={(e) => {
                if (e.target.value.trim()) setDescTouched(true)
              }}
              aria-invalid={!!descError}
              maxLength={1000}
              placeholder="Opcional"
            />
            <FieldError message={descError} reserve />
          </div>

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
            <Button
              type="submit"
              disabled={pending || titleInvalidMsg !== undefined || !!descInvalidMsg || !target}
            >
              {pending ? 'Salvando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
