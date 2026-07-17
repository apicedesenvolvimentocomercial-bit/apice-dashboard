'use client'

import { Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { CreateLeadDialog } from '@/modules/crm/create-lead-dialog'
import type { ProcedureOption } from '@/modules/crm/schedule-lead-dialog'
import { getNewLeadDialogDataAction } from '@/server/actions/lead-actions'

type DialogData = { stageId: string; pipelineId: string; procedures: ProcedureOption[] }

/**
 * Botão dourado "Novo lead" do topbar (design.md §4) — ação GLOBAL do chrome:
 * abre o mesmo dialog de criação do funil, com destino fixo na etapa Lead do
 * funil COMERCIAL (resolvida server-side no clique, junto com os procedimentos
 * de interesse). Criou → redireciona p/ `/crm?highlight=<id>`: o funil ativa a
 * aba certa, injeta o card se preciso e o destaca (mesmo fluxo da busca global).
 */
export function TopbarNewLead({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DialogData | null>(null)

  // Busca os dados a cada clique (etapa/procedimentos podem mudar) — o dialog
  // só abre com destino válido, então o submit nunca falha por etapa ausente.
  async function handleClick() {
    if (loading) return
    setLoading(true)
    const res = await getNewLeadDialogDataAction(clientId)
    setLoading(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setData(res.data)
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex h-[38px] items-center gap-[7px] rounded-[9px] bg-primary px-[15px] text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
      >
        {loading ? (
          <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
        )}
        Novo lead
      </button>

      {data && (
        <CreateLeadDialog
          open={open}
          onOpenChange={setOpen}
          clientId={clientId}
          defaultStageId={data.stageId}
          procedures={data.procedures}
          onCreated={(lead) => router.push(`/crm?highlight=${lead.id}`)}
        />
      )}
    </>
  )
}
