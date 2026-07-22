'use client'

import { X } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { Input } from '@/components/ui/input'
import { IntegerInput } from '@/components/ui/integer-input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { cn } from '@/lib/utils'
import { EMAIL_REGEX, MAX_CARD_NOTES, PHONE_BR_REGEX, SAFE_TEXT_REGEX } from '@/lib/masks'
import { getScheduleViolation } from '@/lib/schedule-violation'
import {
  createAppointmentAction,
  createScheduledLeadFromAgendaAction,
} from '@/server/actions/appointment-actions'
import type { PatientWithStats } from '@/server/repositories/patient-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'
import { DEFAULT_SCHEDULE } from './types'
import type { ClinicSchedule } from './types'

type Mode = 'existing' | 'new-lead'

/** Alternador de modo — segmented com pílula deslizante, mesmo primitivo visual
 *  do seletor Dia/Semana/Mês/Lista da `AgendaToolbar` (e do `PeriodBar`). */
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'existing', label: 'Paciente existente' },
  { value: 'new-lead', label: 'Novo lead' },
]

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'ORGANIC', label: 'Orgânico' },
  { value: 'REFERRAL', label: 'Indicação' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'WALK_IN', label: 'Presencial' },
  { value: 'OTHER', label: 'Outro' },
]

type LeadField = 'name' | 'phone' | 'email' | 'source'
type LeadErrors = Partial<Record<LeadField, string>>

/** Regra cruzada: cobrada só no submit (ver `leadError`). */
const CONTACT_REQUIRED = 'Informe telefone ou e-mail'

/**
 * Validação do modo "novo lead" — espelha `create-lead-dialog` e o zod da
 * action. Mensagens de UMA linha curta (ver `field-error.tsx`): elas moram
 * debaixo de inputs em grid de 2 colunas.
 */
function validateLead(f: {
  name: string
  phone: string
  email: string
  source: string
}): LeadErrors {
  const errors: LeadErrors = {}
  const name = f.name.trim()

  if (!name) errors.name = 'Nome obrigatório'
  else if (name.length < 2) errors.name = 'Mínimo 2 caracteres'
  else if (name.length > 255) errors.name = 'Nome muito grande'
  else if (!SAFE_TEXT_REGEX.test(name)) errors.name = 'Caracteres inválidos'

  // Cada um é opcional isoladamente (valida o formato só se houver conteúdo),
  // mas ao menos UM contato é exigido — lead sem contato nasce inalcançável.
  if (f.phone.trim() && !PHONE_BR_REGEX.test(f.phone.trim())) errors.phone = 'Telefone incompleto'
  else if (!f.phone.trim() && !f.email.trim()) errors.phone = CONTACT_REQUIRED
  if (f.email.trim() && !EMAIL_REGEX.test(f.email.trim())) errors.email = 'E-mail inválido'
  if (!f.source) errors.source = 'Origem obrigatória'

  return errors
}

type Props = {
  open: boolean
  clientId: string
  patients: PatientWithStats[]
  procedures: ProcedureForSelect[]
  defaultDate?: string
  schedule?: ClinicSchedule
  onOpenChange: (open: boolean) => void
  /** Recebe o agendamento criado p/ quem quiser navegar/destacar (agenda). */
  onCreated?: (created?: { appointmentId: string; scheduledAt: string }) => void
}

export function CreateAppointmentDialog({
  open,
  clientId,
  patients,
  procedures,
  defaultDate,
  schedule = DEFAULT_SCHEDULE,
  onOpenChange,
  onCreated,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<Mode>('existing')
  // Remonta o Select de procedimentos após cada escolha p/ voltar ao placeholder.
  const [procPickKey, setProcPickKey] = useState(0)
  const [form, setForm] = useState({
    patientId: '',
    // Campos do lead novo (modo "new-lead").
    name: '',
    phone: '',
    email: '',
    // Vazio de propósito: pré-selecionar "Outro" induz o usuário a aceitar o
    // padrão e suja o relatório de origem de leads. Obrigatório escolher.
    source: '',
    procedureIds: [] as string[],
    scheduledAt: defaultDate ?? '',
    // String de dígitos (formato do `IntegerInput`); `Number()` só no submit.
    durationMinutes: '60',
    notes: '',
  })
  // Erro inline só aparece depois que o usuário sai do campo (ou tenta salvar),
  // senão acusaria "Nome obrigatório" na primeira letra.
  const [leadTouched, setLeadTouched] = useState<Partial<Record<LeadField, boolean>>>({})
  const [durationTouched, setDurationTouched] = useState(false)
  const [notesTouched, setNotesTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [dateBlurred, setDateBlurred] = useState(false)
  const [pastDateAck, setPastDateAck] = useState(false)
  const [scheduleAck, setScheduleAck] = useState(false)
  const [farFutureAck, setFarFutureAck] = useState(false)

  // Ao abrir (clique num horário), preenche a data com o slot clicado. O dialog
  // fica montado entre aberturas, então sem isto a data do 1º clique "gruda".
  useEffect(() => {
    if (open && defaultDate) {
      setForm((f) => ({ ...f, scheduledAt: defaultDate }))
      setDateBlurred(false)
    }
  }, [open, defaultDate])

  // Limite duro: 1 ano atrás a partir de agora. Server também valida.
  const minScheduledDate = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d
  })()
  // Formato aceito pelo input datetime-local: "YYYY-MM-DDTHH:mm" no fuso local.
  const pad = (n: number) => String(n).padStart(2, '0')
  const minScheduledAttr = `${minScheduledDate.getFullYear()}-${pad(minScheduledDate.getMonth() + 1)}-${pad(minScheduledDate.getDate())}T${pad(minScheduledDate.getHours())}:${pad(minScheduledDate.getMinutes())}`
  const scheduledDate = form.scheduledAt ? new Date(form.scheduledAt) : null
  const isPastDate = scheduledDate != null && scheduledDate.getTime() < Date.now()
  const isTooOld = scheduledDate != null && scheduledDate.getTime() < minScheduledDate.getTime()
  // Só consideramos "no passado" depois que o usuário sair do input (blur),
  // para não acusar enquanto ainda está digitando "2026-...".
  const showPastWarning = dateBlurred && isPastDate && !isTooOld
  const blockedByPastWarning = showPastWarning && !pastDateAck

  const scheduleViolation = dateBlurred ? getScheduleViolation(form.scheduledAt, schedule) : null
  const blockedBySchedule = scheduleViolation !== null && !scheduleAck

  const farFutureThreshold = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 4)
    return d
  })()
  const isFarFuture = dateBlurred && scheduledDate != null && scheduledDate > farFutureThreshold
  const blockedByFarFuture = isFarFuture && !farFutureAck

  // Duração default = soma das durações dos procedimentos selecionados.
  function sumDuration(ids: string[]): number {
    return ids.reduce((s, id) => s + (procedures.find((p) => p.id === id)?.durationMinutes ?? 0), 0)
  }

  function addProcedure(id: string) {
    setForm((f) => {
      if (f.procedureIds.includes(id)) return f
      const next = [...f.procedureIds, id]
      const sum = sumDuration(next)
      return {
        ...f,
        procedureIds: next,
        durationMinutes: sum > 0 ? String(sum) : f.durationMinutes,
      }
    })
    setProcPickKey((k) => k + 1)
  }

  function removeProcedure(index: number) {
    setForm((f) => {
      const next = f.procedureIds.filter((_, i) => i !== index)
      const sum = sumDuration(next)
      return {
        ...f,
        procedureIds: next,
        durationMinutes: sum > 0 ? String(sum) : f.durationMinutes,
      }
    })
  }

  function reset() {
    setForm({
      patientId: '',
      name: '',
      phone: '',
      email: '',
      source: '',
      procedureIds: [],
      scheduledAt: defaultDate ?? '',
      durationMinutes: '60',
      notes: '',
    })
    setMode('existing')
    setLeadTouched({})
    setDurationTouched(false)
    setNotesTouched(false)
    setSubmitAttempted(false)
    setDateBlurred(false)
    setPastDateAck(false)
    setScheduleAck(false)
    setFarFutureAck(false)
  }

  // O "quem" varia por modo; o resto (procedimento/data/duração/obs + acks) é
  // compartilhado. Modo "existente" = paciente escolhido; modo "novo lead" =
  // nome/telefone/e-mail/origem válidos (origem inclusa: nasce vazia e a action
  // exige o enum, então recusaria '' com erro cru do zod).
  const leadErrors: LeadErrors = mode === 'new-lead' ? validateLead(form) : {}
  // A regra CRUZADA não desabilita o botão: com ele travado o usuário ficaria
  // preso sem explicação. Ela é revelada ao tentar salvar (`handleSubmit`).
  const blockingLead = Object.values(leadErrors).filter((m) => m !== CONTACT_REQUIRED)
  const whoInvalid = mode === 'existing' ? !form.patientId : blockingLead.length > 0
  const leadIncomplete = Object.keys(leadErrors).length > 0
  /**
   * Só mostra o erro depois do blur/submit — e a regra CRUZADA (telefone OU
   * e-mail) só depois do submit: no blur do telefone vazio o usuário ainda pode
   * estar a caminho do e-mail.
   */
  const leadError = (f: LeadField) => {
    const message = leadErrors[f]
    if (!message) return undefined
    if (message === CONTACT_REQUIRED) return submitAttempted ? message : undefined
    return leadTouched[f] ? message : undefined
  }
  /** Campo vazio não é cobrado ao sair; obrigatoriedade fica para o submit. */
  const touchLeadIfFilled = (f: LeadField, value: string) => {
    if (value.trim()) setLeadTouched((t) => ({ ...t, [f]: true }))
  }
  const touchLead = (f: LeadField) => setLeadTouched((t) => ({ ...t, [f]: true }))

  // Duração e observações espelham o zod da action (`appointmentSchema` /
  // `scheduledLeadSchema`): inteiro positivo ≤ 1000 e texto seguro ≤ 65535.
  // Mensagens de UMA linha curta (ver `field-error.tsx`), reveladas no blur.
  const durationNum = Number(form.durationMinutes)
  const durationInvalidMsg = !form.durationMinutes
    ? 'Duração obrigatória'
    : durationNum <= 0
      ? 'Deve ser maior que zero'
      : durationNum > 1000
        ? 'Máximo 1000 minutos'
        : undefined
  const durationError = durationTouched || submitAttempted ? durationInvalidMsg : undefined

  const notesInvalidMsg =
    form.notes.trim() && !SAFE_TEXT_REGEX.test(form.notes) ? 'Caracteres inválidos' : undefined
  const notesError = notesTouched || submitAttempted ? notesInvalidMsg : undefined

  const baseInvalid =
    whoInvalid ||
    form.procedureIds.length === 0 ||
    !form.scheduledAt ||
    durationInvalidMsg !== undefined ||
    notesInvalidMsg !== undefined ||
    isTooOld ||
    blockedByPastWarning ||
    blockedBySchedule ||
    blockedByFarFuture

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (
      whoInvalid ||
      leadIncomplete ||
      form.procedureIds.length === 0 ||
      !form.scheduledAt ||
      durationInvalidMsg ||
      notesInvalidMsg
    ) {
      // Revela os erros inline dos campos que o usuário ainda não visitou (e a
      // regra cruzada telefone-ou-e-mail, que só é cobrada aqui).
      setLeadTouched({ name: true, phone: true, email: true, source: true })
      setDurationTouched(true)
      setNotesTouched(true)
      setSubmitAttempted(true)
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    if (isTooOld) {
      toast.error('Não é possível agendar mais de 1 ano no passado')
      return
    }
    if (blockedByPastWarning) {
      toast.error('Confirme a ciência sobre a data no passado')
      return
    }
    if (blockedBySchedule) {
      toast.error('Confirme o agendamento fora do horário da clínica')
      return
    }
    if (blockedByFarFuture) {
      toast.error('Confirme o agendamento com mais de 4 meses de antecedência')
      return
    }
    startTransition(async () => {
      const result =
        mode === 'existing'
          ? await createAppointmentAction(clientId, {
              patientId: form.patientId,
              procedureIds: form.procedureIds,
              scheduledAt: form.scheduledAt,
              durationMinutes: Number(form.durationMinutes),
              // Vazio vira undefined: o zod é `.optional()`, mas '' reprovaria
              // no regex de caracteres (`+` exige ao menos 1 caractere).
              notes: form.notes.trim() || undefined,
            })
          : await createScheduledLeadFromAgendaAction(clientId, {
              name: form.name.trim(),
              phone: form.phone.trim() || undefined,
              email: form.email.trim() || undefined,
              source: form.source,
              procedureIds: form.procedureIds,
              scheduledAt: form.scheduledAt,
              durationMinutes: Number(form.durationMinutes),
              notes: form.notes.trim() || undefined,
            })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success(mode === 'existing' ? 'Agendamento criado!' : 'Lead criado e agendado!')
      // Guarda antes do reset: quem chama usa a data p/ navegar até o card novo.
      const created = {
        appointmentId: 'appointmentId' in result.data ? result.data.appointmentId : result.data.id,
        scheduledAt: form.scheduledAt,
      }
      reset()
      onOpenChange(false)
      onCreated?.(created)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `max-h`/scroll é rede de segurança p/ telas baixas (mesma do
          create-lead-dialog): com os slots reservados a altura fica estável. */}
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === 'new-lead' ? 'Novo lead agendado' : 'Novo Agendamento'}
          </DialogTitle>
        </DialogHeader>
        {/* `space-y-3` (e não 4): com um slot de erro reservado sob CADA campo,
            o ritmo de 16px somava demais — mesma medida do create-lead-dialog. */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Alterna entre agendar um paciente existente e criar um lead novo
              (que nasce em "Agendado" no funil comercial). Pílula deslizante da
              AgendaToolbar, mas com as cores NEUTRAS originais (o dourado aqui
              foi testado e rejeitado — 2026-07-19). */}
          <div
            className="relative grid auto-cols-fr grid-flow-col rounded-[9px] border border-border bg-muted p-[3px]"
            role="tablist"
            aria-label="Tipo de agendamento"
          >
            <div
              className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] z-0 rounded-[7px] bg-background shadow-sm transition-transform duration-340 ease-senno"
              style={{
                width: `calc((100% - 6px) / ${MODE_OPTIONS.length})`,
                transform: `translateX(${
                  Math.max(
                    0,
                    MODE_OPTIONS.findIndex((o) => o.value === mode)
                  ) * 100
                }%)`,
              }}
              aria-hidden="true"
            />
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={mode === opt.value}
                onClick={() => setMode(opt.value)}
                className={cn(
                  'relative z-[1] whitespace-nowrap rounded-[7px] px-[13px] py-1.5 text-[12.5px] font-semibold transition-colors duration-250',
                  mode === opt.value
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'existing' ? (
            <div className="space-y-2">
              <Label htmlFor="apt-patient">Paciente *</Label>
              <SearchableSelect
                portal={false}
                contentClassName="bg-background"
                id="apt-patient"
                value={form.patientId}
                onChange={(v) => setForm((f) => ({ ...f, patientId: v }))}
                placeholder="Selecionar paciente..."
                emptyText="Nenhum paciente encontrado"
                options={patients.map((p) => ({
                  value: p.id,
                  label: p.name,
                  sublabel: p.phone ?? undefined,
                }))}
              />
              {/* Sem validação própria (o botão fica desabilitado sem paciente);
                  o slot existe só p/ igualar o espaçamento dos outros campos. */}
              <FieldError reserve />
            </div>
          ) : (
            /* Cada campo tem a linha de erro RESERVADA (`reserve`): o erro
               aparece e some sem empurrar o resto do diálogo. */
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="lead-name">Nome *</Label>
                <Input
                  id="lead-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={(e) => touchLeadIfFilled('name', e.target.value)}
                  aria-invalid={!!leadError('name')}
                  maxLength={255}
                  placeholder="Nome do lead"
                />
                <FieldError message={leadError('name')} reserve />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lead-phone">Telefone</Label>
                  <PhoneInput
                    id="lead-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    onBlur={(e) => touchLeadIfFilled('phone', e.target.value)}
                    aria-invalid={!!leadError('phone')}
                  />
                  <FieldError message={leadError('phone')} reserve />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-email">E-mail</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    onBlur={(e) => touchLeadIfFilled('email', e.target.value)}
                    aria-invalid={!!leadError('email')}
                    maxLength={255}
                    placeholder="exemplo@mail.com"
                  />
                  <FieldError message={leadError('email')} reserve />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-source">Origem *</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, source: v }))
                    touchLead('source')
                  }}
                >
                  <SelectTrigger id="lead-source">
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  {/* `bg-background` casa com o fundo do dialog — o `bg-popover`
                      padrão é mais claro no dark e destoava do popup. */}
                  <SelectContent className="bg-background">
                    {SOURCE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={leadError('source')} reserve />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apt-procedure">
              {mode === 'new-lead' ? 'Procedimentos de interesse *' : 'Procedimentos *'}
            </Label>
            {/* Combobox COM busca (a lista de procedimentos cresce por clínica).
                O `key` remonta após cada escolha para limpar a busca e voltar ao
                placeholder; já escolhidos saem da lista. */}
            <SearchableSelect
              key={procPickKey}
              portal={false}
              contentClassName="bg-background"
              id="apt-procedure"
              value=""
              onChange={addProcedure}
              placeholder="Adicionar procedimento..."
              searchPlaceholder="Buscar procedimento..."
              emptyText={
                procedures.length === 0
                  ? 'Nenhum procedimento cadastrado'
                  : 'Nenhum procedimento encontrado'
              }
              options={procedures
                .filter((p) => !form.procedureIds.includes(p.id))
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  sublabel: p.durationMinutes ? `${p.durationMinutes}min` : undefined,
                }))}
            />
            {form.procedureIds.length > 0 && (
              <ul className="mt-2 space-y-1">
                {form.procedureIds.map((id, i) => {
                  const proc = procedures.find((p) => p.id === id)
                  return (
                    <li
                      key={`${id}-${i}`}
                      className="flex items-center justify-between rounded-md border bg-muted/40 px-2 py-1 text-sm"
                    >
                      <span>{proc?.name ?? 'Procedimento'}</span>
                      <span className="flex items-center gap-2">
                        {proc?.durationMinutes ? (
                          <span className="text-muted-foreground">{proc.durationMinutes}min</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeProcedure(i)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover procedimento"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {/* Slot só p/ ritmo — obrigatoriedade desabilita o botão. */}
            <FieldError reserve />
          </div>

          {/* 3 colunas com a data/hora ocupando 2: o campo composto precisa de
              ~240px (data + hora + os dois ícones) e a duração vive com pouco. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="apt-date">Data e hora *</Label>
              <DateTimeInput
                id="apt-date"
                min={minScheduledAttr}
                value={form.scheduledAt}
                onChange={(e) => {
                  setForm((f) => ({ ...f, scheduledAt: e.target.value }))
                  setPastDateAck(false)
                  setScheduleAck(false)
                  setFarFutureAck(false)
                }}
                onBlur={() => setDateBlurred(true)}
                invalid={isTooOld}
              />
              <FieldError message={isTooOld ? 'Máximo 1 ano no passado' : undefined} reserve />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apt-duration">Duração (min)</Label>
              {/* Só dígitos entram (inteiro garantido na digitação); teto do
                  zod = 1000 → 4 dígitos. */}
              <IntegerInput
                id="apt-duration"
                maxDigits={4}
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                onBlur={() => setDurationTouched(true)}
                aria-invalid={!!durationError}
              />
              <FieldError message={durationError} reserve />
            </div>
          </div>

          {showPastWarning && (
            <label
              htmlFor="apt-past-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                pastDateAck
                  ? 'border-emerald-300 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200'
              }`}
            >
              <input
                id="apt-past-ack"
                type="checkbox"
                checked={pastDateAck}
                onChange={(e) => setPastDateAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
              />
              <span>
                Estou ciente que esta data e hora já se passaram e desejo registrar este agendamento
                mesmo assim.
              </span>
            </label>
          )}

          {scheduleViolation && (
            <label
              htmlFor="apt-schedule-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                scheduleAck
                  ? 'border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-200'
              }`}
            >
              <input
                id="apt-schedule-ack"
                type="checkbox"
                checked={scheduleAck}
                onChange={(e) => setScheduleAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-orange-600"
              />
              <span>
                <strong>Fora do expediente:</strong> {scheduleViolation} Estou ciente e desejo
                agendar mesmo assim.
              </span>
            </label>
          )}

          {isFarFuture && (
            <label
              htmlFor="apt-future-ack"
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                farFutureAck
                  ? 'border-blue-300 bg-blue-50/60 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
              }`}
            >
              <input
                id="apt-future-ack"
                type="checkbox"
                checked={farFutureAck}
                onChange={(e) => setFarFutureAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
              />
              <span>
                <strong>Agendamento distante:</strong> A data selecionada está a mais de 4 meses no
                futuro. Estou ciente e desejo confirmar este agendamento.
              </span>
            </label>
          )}

          <div className="space-y-2">
            <Label htmlFor="apt-notes">Observações</Label>
            <textarea
              id="apt-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              onBlur={() => setNotesTouched(true)}
              rows={2}
              maxLength={MAX_CARD_NOTES}
              aria-invalid={!!notesError}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Observações opcionais..."
            />
            <FieldError message={notesError} reserve />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || baseInvalid}>
              {isPending ? 'Salvando...' : mode === 'new-lead' ? 'Criar e agendar' : 'Agendar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
