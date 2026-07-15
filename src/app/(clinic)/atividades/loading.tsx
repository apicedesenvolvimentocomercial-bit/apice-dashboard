/**
 * Skeleton da tela de Atividades (atividades-handoff §9.3): chip de pastas,
 * barra de abas e card com 4 linhas placeholder em shimmer — nunca spinner.
 */
export default function AtividadesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="senno-shimmer mb-2 h-[38px] w-56 self-start rounded-full" />
      <div className="flex items-center justify-between gap-4">
        <div className="senno-shimmer h-9 w-[420px] max-w-full rounded-lg" />
        <div className="senno-shimmer h-9 w-36 flex-none rounded-[9px]" />
      </div>
      <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3.5 border-t border-border px-[18px] py-3.5"
          >
            <div className="senno-shimmer h-[38px] w-[38px] flex-none rounded-[10px]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="senno-shimmer h-[13px] w-[55%] rounded-md" />
              <div className="senno-shimmer h-[11px] w-[35%] rounded-md" />
            </div>
            <div className="senno-shimmer h-3 w-[70px] flex-none rounded-md" />
            <div className="senno-shimmer h-6 w-6 flex-none rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
