/**
 * Skeleton da tela Exportações (Exportações-handoff §10): barra de Período +
 * grade de cards (tile 44×44, título, 2 linhas de descrição, pílulas de
 * botão) — shimmer, nunca spinner de página.
 */
export default function ExportsLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* barra de Período */}
      <div className="flex flex-wrap items-center gap-3 rounded-[13px] border border-border bg-card px-5 py-[18px] shadow-card">
        <div className="senno-shimmer h-[34px] w-[34px] flex-none rounded-[9px]" />
        <div className="senno-shimmer h-4 w-16 rounded" />
        <div className="ml-auto flex flex-wrap items-end gap-[18px]">
          <div className="senno-shimmer h-[38px] w-40 rounded-[9px]" />
          <div className="senno-shimmer h-[38px] w-40 rounded-[9px]" />
          <div className="senno-shimmer h-[38px] w-[330px] rounded-[9px]" />
        </div>
      </div>

      {/* grade de cards */}
      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(322px,1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[196px] flex-col gap-4 rounded-[15px] border border-border bg-card p-6 pb-[22px] shadow-card"
          >
            <div className="flex items-center gap-[13px]">
              <div className="senno-shimmer h-11 w-11 flex-none rounded-xl" />
              <div className="senno-shimmer h-[18px] w-3/5 rounded" />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <div className="senno-shimmer h-3.5 w-full rounded" />
              <div className="senno-shimmer h-3.5 w-4/5 rounded" />
            </div>
            <div className="flex gap-2.5">
              <div className="senno-shimmer h-10 w-24 rounded-[10px]" />
              <div className="senno-shimmer h-10 w-24 rounded-[10px]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
