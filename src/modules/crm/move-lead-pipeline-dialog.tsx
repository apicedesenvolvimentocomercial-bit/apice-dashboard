'use client'

import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { moveLeadToPipelineAction } from '@/server/actions/lead-actions'

import { PIPELINE_CATEGORY_LABELS, type PipelineMoveTarget } from './types'

// birthDate é gravado como meia-noite UTC; lê pelos componentes UTC p/ não deslocar
// o dia no fuso local (mesma convenção do attend-appointment-dialog).
function birthToInput(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  leadId: string
  /** Categoria do funil de ORIGEM (define se mover p/ Paciente é conversão). */
  sourceCategory: PipelineMoveTarget['category']
  /** Funil atual (excluído da lista de destinos). */
  currentPipelineId: string
  /** Todos os funis da clínica (a lista de destino exclui o atual). */
  pipelines: PipelineMoveTarget[]
  /** Pré-preenche os 5 campos quando o lead já tem dados/paciente. */
  patientDefaults?: {
    name?: string | null
    phone?: string | null
    email?: string | null
    birthDate?: Date | string | null
    cpf?: string | null
  } | null
  onMoved: () => void
}

export function MoveLeadPipelineDialog({
  open,
  onOpenChange,
  clientId,
  leadId,
  sourceCategory,
  currentPipelineId,
  pipelines,
  patientDefaults,
  onMoved,
}: Props) {
  const targets = useMemo(
    () => pipelines.filter((p) => p.id !== currentPipelineId),
    [pipelines, currentPipelineId]
  )
  const [targetId, setTargetId] = useState('')
  const [reason, setReason] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', birthDate: '', cpf: '' })
  const [pending, setPending] = useState(false)

  const target = targets.find((p) => p.id === targetId)
  // Conversão = origem LEAD → destino PATIENT: exige os 5 campos + motivo.
  const isConversion = sourceCategory === 'LEAD' && target?.category === 'PATIENT'

  // Pré-preenche os campos do paciente ao escolher um destino de paciente.
  function selectTarget(id: string) {
    setTargetId(id)
    const t = pipelines.find((p) => p.id === id)
    if (sourceCategory === 'LEAD' && t?.category === 'PATIENT') {
      setForm({
        name: patientDefaults?.name ?? '',
        phone: patientDefaults?.phone ?? '',
        email: patientDefaults?.email ?? '',
        birthDate: birthToInput(patientDefaults?.birthDate),
        cpf: patientDefaults?.cpf ?? '',
      })
    }
  }

  function handleSubmit() {
    if (!targetId) {
      toast.error('Escolha o funil destino')
      return
    }
    if (isConversion) {
      if (
        !form.name.trim() ||
        !form.phone.trim() ||
        !form.email.trim() ||
        !form.birthDate ||
        !form.cpf.trim()
      ) {
        toast.error('Preencha todos os dados do paciente')
        return
      }
      if (!reason.trim()) {
        toast.error('Informe o motivo')
        return
      }
    }
    setPending(true)
    moveLeadToPipelineAction(leadId, clientId, {
      targetPipelineId: targetId,
      patient: isConversion
        ? {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            birthDate: form.birthDate,
            cpf: form.cpf.trim(),
          }
        : undefined,
      reason: isConversion ? reason.trim() : undefined,
    })
      .then((res) => {
        if (!res.success) {
          toast.error(res.error.message)
          return
        }
        toast.success(
          res.data.converted ? 'Card movido — lead convertido em paciente' : 'Card movido de funil'
        )
        onOpenChange(false)
        setTargetId('')
        setReason('')
        onMoved()
      })
      .finally(() => setPending(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Mover para outro funil</DialogTitle>
          <DialogDescription>
            Escolha o funil destino. Mover de um funil de Lead para um de Paciente completa o
            cadastro e converte o lead em paciente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Funil destino</Label>
            {targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Não há outro funil disponível.</p>
            ) : (
              <Select value={targetId} onValueChange={selectTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar funil..." />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {PIPELINE_CATEGORY_LABELS[p.category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isConversion && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Funil de paciente: complete o cadastro (vira paciente real) e informe o motivo
                (registrado no histórico/auditoria).
              </p>
              <div className="space-y-1">
                <Label htmlFor="mv-name">Nome *</Label>
                <Input
                  id="mv-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="mv-phone">Telefone *</Label>
                  <Input
                    id="mv-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mv-cpf">CPF *</Label>
                  <Input
                    id="mv-cpf"
                    value={form.cpf}
                    onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="mv-email">E-mail *</Label>
                  <Input
                    id="mv-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mv-birth">Nascimento *</Label>
                  <DateInput
                    id="mv-birth"
                    value={form.birthDate}
                    onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mv-reason">Motivo *</Label>
                <Input
                  id="mv-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: virou paciente, iniciou tratamento..."
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending || targets.length === 0 || !targetId}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
