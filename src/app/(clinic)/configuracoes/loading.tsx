/**
 * Skeleton da tela Configurações (design.md §5 — shimmer, nunca spinner):
 * busca de configuração + linha de chips + dois cards de seção com grid de
 * campos, na mesma coluna centralizada de 940px do conteúdo real.
 */
export default function ClinicSettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-[940px]">
      {/* busca + chips */}
      <div className="mb-[22px]">
        <div className="senno-shimmer h-[42px] w-[340px] max-w-full rounded-[10px]" />
        <div className="mt-3.5 flex flex-wrap gap-2">
          {[72, 84, 96, 88, 170, 110, 150, 96, 160, 168].map((w, i) => (
            <div key={i} className="senno-shimmer h-[38px] rounded-[10px]" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* cards de seção */}
      <div className="flex flex-col gap-3.5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[14px] border border-border bg-card px-[26px] py-6 shadow-card max-sm:px-5"
          >
            <div className="senno-shimmer h-[18px] w-36 rounded" />
            <div className="senno-shimmer mt-2.5 h-3.5 w-4/5 max-w-md rounded" />
            <div className="mt-5 grid grid-cols-1 gap-x-[18px] gap-y-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j}>
                  <div className="senno-shimmer h-3 w-24 rounded" />
                  <div className="senno-shimmer mt-2 h-10 w-full rounded-[9px]" />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end border-t border-border pt-5">
              <div className="senno-shimmer h-10 w-40 rounded-[9px]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
