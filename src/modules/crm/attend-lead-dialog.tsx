'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { attendLeadAction } from '@/server/actions/lead-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  leadId: string | null
  stageId: string
  /** Pré-preenche os campos já conhecidos do lead. */
  defaults: { name: string; phone: string | null; email: string | null }
  /** Confirmado → o board persiste o move. */
  onAttended: () => void
  /** Cancelado/erro → o board reverte o card para a etapa de origem. */
  onCancel: () => void
}

/**
 * feat1 — Dialog BLOQUEANTE ao arrastar um card para "Compareceu". Completa o
 * cadastro do paciente: nome, telefone, e-mail, data de nascimento e CPF — todos
 * obrigatórios. Ao salvar, o paciente passa a ser "real" e o agendamento é
 * marcado como comparecido (`attendLeadAction`). Cancelar devolve o card.
 */
export function AttendLeadDialog({
  open,
  onOpenChange,
  clientId,
  leadId,
  stageId,
  defaults,
  onAttended,
  onCancel,
}: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [cpf, setCpf] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setName(defaults.name ?? '')
      setPhone(defaults.phone ?? '')
      setEmail(defaults.email ?? '')
      setBirthDate('')
      setCpf('')
    }
  }, [open, defaults])

  function cancel() {
    onOpenChange(false)
    onCancel()
  }

  function confirm() {
    if (!leadId) return
    if (!name.trim() || !phone.trim() || !email.trim() || !birthDate || !cpf.trim()) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    startTransition(async () => {
      const res = await attendLeadAction(leadId, clientId, {
        stageId,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        birthDate,
        cpf: cpf.trim(),
      })
      if (!res.success) {
        toast.error(res.error.message)
        onOpenChange(false)
        onCancel()
        return
      }
      toast.success('Comparecimento registrado — cadastro completo')
      onOpenChange(false)
      onAttended()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Fechar pelo X / overlay = cancelar (reverte o card).
        if (!o) cancel()
        else onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby="attend-lead-desc">
        <DialogHeader>
          <DialogTitle>Compareceu — completar cadastro</DialogTitle>
          <DialogDescription id="attend-lead-desc">
            Para registrar o comparecimento, complete o cadastro do paciente. Todos os campos são
            obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="attend-name">Nome *</Label>
            <Input
              id="attend-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="attend-phone">Telefone *</Label>
              <Input
                id="attend-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="attend-cpf">CPF *</Label>
              <Input
                id="attend-cpf"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="attend-email">E-mail *</Label>
              <Input
                id="attend-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="attend-birth">Nascimento *</Label>
              <Input
                id="attend-birth"
                type="date"
                lang="pt-BR"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={
              pending || !name.trim() || !phone.trim() || !email.trim() || !birthDate || !cpf.trim()
            }
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar comparecimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
