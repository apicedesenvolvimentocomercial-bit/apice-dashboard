'use client'

import { Loader2, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getInitials } from '@/lib/utils'
import { createPatientCardAction, listAvailablePatientsAction } from '@/server/actions/lead-actions'

type Patient = { id: string; name: string; phone: string | null }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  defaultStageId?: string
  /** Nome da etapa alvo — subtítulo "Etapa X" do picker (handoff §8.2). */
  stageName?: string
  onCreated: (lead: { id: string; stageId: string; name: string }) => void
}

/** Normaliza p/ match: minúsculas + sem acentos (handoff §8.3, alinhado ao topbar). */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Modal "Adicionar paciente" (picker — Funil-handoff §8). Funil de RETENÇÃO:
 * o card vem de um paciente já cadastrado, não de um lead novo. Lista
 * pacientes sem card ativo; busca por nome (sem acento) ou telefone (dígitos);
 * clicar na linha cria o card na etapa alvo.
 */
export function AddPatientCardDialog({
  open,
  onOpenChange,
  clientId,
  defaultStageId,
  stageName,
  onCreated,
}: Props) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setLoadingList(true)
    listAvailablePatientsAction(clientId)
      .then((res) => {
        if (res.success) setPatients(res.data)
      })
      .catch(() => toast.error('Erro ao carregar pacientes'))
      .finally(() => setLoadingList(false))
  }, [open, clientId])

  // Filtro (handoff §8.3): nome normalizado contém q OU dígitos do telefone
  // contêm os dígitos de q.
  const filtered = useMemo(() => {
    const q = norm(query.trim())
    const qd = query.replace(/\D/g, '')
    if (!q) return patients
    return patients.filter((p) => {
      if (norm(p.name).includes(q)) return true
      if (qd && p.phone && p.phone.replace(/\D/g, '').includes(qd)) return true
      return false
    })
  }, [patients, query])

  async function handlePick(patientId: string) {
    if (submitting) return
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
      <DialogContent className="flex max-h-[calc(100vh-48px)] w-[440px] max-w-full flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0">
        <DialogHeader className="space-y-0 px-[22px] pb-3 pt-5 text-left">
          <DialogTitle className="text-lg font-semibold tracking-[-0.01em]">
            Adicionar paciente
          </DialogTitle>
          <DialogDescription className="mt-[3px] text-[12.5px] text-muted-foreground">
            {stageName ? (
              <>
                Etapa <span className="font-semibold text-primary-text">{stageName}</span>
              </>
            ) : (
              'Escolha o paciente para criar o card.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Campo de busca (handoff §8.3). */}
        <div className="px-[22px] pb-3">
          <div className="flex h-10 items-center gap-2 rounded-[10px] border border-input bg-background px-[13px] transition-shadow focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]">
            <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar paciente por nome ou telefone…"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Buscar paciente"
            />
            {submitting && (
              <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Lista de resultados (handoff §8.4). */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-0.5">
          {loadingList ? (
            // Skeleton no lugar de spinner (design.md §5 — estados).
            <div className="flex flex-col gap-1 px-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[10px] p-2.5">
                  <div className="senno-shimmer h-9 w-9 flex-none rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="senno-shimmer h-3.5 w-2/3 rounded" />
                    <div className="senno-shimmer h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center">
              <Search className="h-[26px] w-[26px] text-muted-foreground" aria-hidden="true" />
              <p className="text-[13.5px] font-semibold">
                {patients.length === 0
                  ? 'Nenhum paciente disponível'
                  : 'Nenhum paciente encontrado'}
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                {patients.length === 0
                  ? 'Todos os pacientes já estão no funil.'
                  : 'Tente outro nome ou telefone.'}
              </p>
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={submitting}
                onClick={() => handlePick(p.id)}
                className="flex w-full items-center gap-3 rounded-[10px] p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/[0.16] text-[12.5px] font-semibold text-primary-text">
                  {getInitials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                  {p.phone && (
                    <span className="block truncate text-xs tabular-nums text-muted-foreground">
                      {p.phone}
                    </span>
                  )}
                </span>
                <Plus
                  className="h-[18px] w-[18px] flex-none text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
