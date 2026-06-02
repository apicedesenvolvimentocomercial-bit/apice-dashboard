'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { createPatientCardAction, listAvailablePatientsAction } from '@/server/actions/lead-actions'

type Patient = { id: string; name: string; phone: string | null }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  defaultStageId?: string
  onCreated: (lead: { id: string; stageId: string; name: string }) => void
}

/**
 * Funil EXISTING: o card vem de um paciente já cadastrado, não de um lead novo.
 * Lista pacientes sem card ativo e cria o card vinculado ao paciente escolhido.
 */
export function AddPatientCardDialog({
  open,
  onOpenChange,
  clientId,
  defaultStageId,
  onCreated,
}: Props) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [patientId, setPatientId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setPatientId('')
    setLoadingList(true)
    listAvailablePatientsAction(clientId)
      .then((res) => {
        if (res.success) setPatients(res.data)
      })
      .catch(() => toast.error('Erro ao carregar pacientes'))
      .finally(() => setLoadingList(false))
  }, [open, clientId])

  async function handleSubmit() {
    if (!patientId) {
      toast.error('Selecione um paciente')
      return
    }
    if (!defaultStageId) {
      toast.error('Etapa de destino não definida')
      return
    }
    setSubmitting(true)
    const res = await createPatientCardAction(clientId, patientId, defaultStageId)
    setSubmitting(false)

    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    toast.success('Cliente adicionado ao funil')
    onOpenChange(false)
    onCreated({ id: res.data.id, stageId: res.data.stageId, name: res.data.name })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Adicionar cliente ao funil</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Paciente</Label>
          {loadingList ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando pacientes…
            </div>
          ) : patients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum paciente disponível (todos já estão no funil).
            </p>
          ) : (
            <SearchableSelect
              value={patientId}
              onChange={setPatientId}
              placeholder="Selecione um paciente"
              emptyText="Nenhum paciente encontrado"
              options={patients.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.phone ?? undefined,
              }))}
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || loadingList || !patientId}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
