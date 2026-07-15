import { AgendaGridSkeleton } from '@/components/clinic/appointments/agenda-states'

/**
 * Skeleton da Agenda (agenda-handoff §10): toolbar + grade com shimmer —
 * nunca spinner. A estrutura da grade (cabeçalho/linhas) fica visível; o
 * shimmer entra onde haveria dado.
 */
export default function AgendaLoading() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex items-center gap-2">
          <div className="senno-shimmer h-[34px] w-[69px] rounded-[9px]" />
          <div className="senno-shimmer h-[34px] w-16 rounded-[9px]" />
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="senno-shimmer h-5 w-44 rounded-md" />
        </div>
        <div className="flex items-center gap-[9px]">
          <div className="senno-shimmer h-[38px] w-[248px] rounded-[9px]" />
          <div className="senno-shimmer h-[38px] w-[38px] rounded-[9px]" />
          <div className="senno-shimmer h-[38px] w-[38px] rounded-[9px]" />
          <div className="senno-shimmer h-[38px] w-44 rounded-[9px]" />
        </div>
      </div>
      <AgendaGridSkeleton />
      <div className="flex items-center gap-5">
        <div className="senno-shimmer h-3.5 w-16 rounded" />
        <div className="senno-shimmer h-3.5 w-28 rounded" />
      </div>
    </div>
  )
}
