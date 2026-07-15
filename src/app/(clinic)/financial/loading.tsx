/**
 * Skeleton da tela Financeiro (Financeiro-handoff §16): barra de abas + KPIs +
 * gráfico com shimmer — nunca spinner. Espelha a aba default (Visão Geral).
 */
export default function FinancialLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* barra de abas */}
      <div className="flex items-center gap-3 self-start border-b border-border pb-[9px]">
        <div className="senno-shimmer h-4 w-20 rounded" />
        <div className="senno-shimmer h-4 w-10 rounded" />
        <div className="senno-shimmer h-4 w-16 rounded" />
        <div className="senno-shimmer h-4 w-28 rounded" />
        <div className="senno-shimmer h-4 w-14 rounded" />
        <div className="senno-shimmer h-4 w-12 rounded" />
      </div>

      {/* duas linhas de KPIs */}
      {Array.from({ length: 2 }).map((_, row) => (
        <div
          key={row}
          className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(228px,1fr))]"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[13px] border border-border bg-card px-[17px] py-4 shadow-card"
            >
              <div className="senno-shimmer h-3 w-3/5 rounded" />
              <div className="senno-shimmer mt-3 h-7 w-2/5 rounded" />
              <div className="senno-shimmer mt-2 h-4 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ))}

      {/* gráfico */}
      <div className="rounded-[13px] border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="senno-shimmer h-4 w-48 rounded" />
          <div className="senno-shimmer h-[30px] w-40 rounded-lg" />
        </div>
        <div className="senno-shimmer mt-4 h-[220px] w-full rounded" />
      </div>

      {/* rankings */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[13px] border border-border bg-card px-5 py-[18px] shadow-card"
          >
            <div className="senno-shimmer h-4 w-2/5 rounded" />
            <div className="mt-4 flex flex-col gap-[15px]">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j}>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="senno-shimmer h-[22px] w-[22px] flex-none rounded-md" />
                    <div className="senno-shimmer h-3 flex-1 rounded" />
                    <div className="senno-shimmer h-3 w-20 flex-none rounded" />
                  </div>
                  <div className="senno-shimmer ml-[34px] h-1.5 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
