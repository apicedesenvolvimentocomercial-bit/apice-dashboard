// Mesmo grid do cabeçalho/linhas da tabela (patients-list §5.1) p/ o skeleton
// alinhar com o conteúdo real.
const GRID =
  'grid grid-cols-[minmax(0,2.3fr)_minmax(0,1.9fr)_112px_112px_92px_minmax(0,1.7fr)] items-center gap-4'

/**
 * Skeleton da aba Pacientes (Pacientes-handoff §9): abas + tabela com shimmer —
 * nunca spinner. Mantém a estrutura de 6 colunas; o shimmer entra onde há dado.
 */
export default function PatientsLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* abas + ação */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-[9px]">
          <div className="senno-shimmer h-4 w-16 rounded" />
          <div className="senno-shimmer h-4 w-16 rounded" />
          <div className="senno-shimmer h-4 w-20 rounded" />
        </div>
        <div className="senno-shimmer h-9 w-36 rounded-[9px]" />
      </div>

      {/* tabela */}
      <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
        <div className={`${GRID} border-b border-border bg-muted/40 px-5 py-[11px]`}>
          <div className="senno-shimmer h-3 w-16 rounded" />
          <div className="senno-shimmer h-3 w-14 rounded" />
          <div className="senno-shimmer h-3 w-12 rounded" />
          <div className="senno-shimmer h-3 w-16 rounded" />
          <div className="senno-shimmer mx-auto h-3 w-10 rounded" />
          <div className="senno-shimmer h-3 w-10 rounded" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${GRID} border-t border-border px-5 py-3`}>
            <div className="flex items-center gap-[11px]">
              <div className="senno-shimmer h-9 w-9 flex-none rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="senno-shimmer h-3 w-3/5 rounded" />
                <div className="senno-shimmer h-2.5 w-2/5 rounded" />
              </div>
            </div>
            <div className="senno-shimmer h-3 w-4/5 rounded" />
            <div className="senno-shimmer h-3 w-16 rounded" />
            <div className="senno-shimmer h-3 w-16 rounded" />
            <div className="senno-shimmer mx-auto h-[18px] w-[26px] rounded-full" />
            <div className="flex gap-1.5">
              <div className="senno-shimmer h-[18px] w-14 rounded-full" />
              <div className="senno-shimmer h-[18px] w-12 rounded-full" />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-5 py-[11px]">
          <div className="senno-shimmer h-3 w-40 rounded" />
          <div className="flex gap-[7px]">
            <div className="senno-shimmer h-8 w-8 rounded-lg" />
            <div className="senno-shimmer h-8 w-8 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
