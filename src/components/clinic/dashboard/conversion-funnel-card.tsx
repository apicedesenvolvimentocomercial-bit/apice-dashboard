import { Filter } from 'lucide-react'

export type FunnelStage = { stage: string; count: number; isWon: boolean; isLost: boolean }

/**
 * Card "Funil de conversão" (handoff §11): barra por etapa com % relativa à
 * 1ª etapa e alpha do dourado crescendo com a proporção (0.35 + pct×0.65).
 * As etapas de perda (Cancelado) não entram no funil de conversão, mas são
 * mostradas numa seção separada em vermelho (token destructive) — a clínica
 * precisa enxergar quantos leads caíram. Server-safe (sem estado).
 */
export function ConversionFunnelCard({ stages }: { stages: FunnelStage[] }) {
  const visible = stages.filter((s) => !s.isLost)
  const lost = stages.filter((s) => s.isLost)
  const base = visible[0]?.count ?? 0

  return (
    <div className="flex h-full flex-col rounded-[13px] border border-border bg-card px-[18px] py-4 shadow-card transition-colors hover:border-primary/50">
      <h2 className="m-0 mb-3.5 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
        Funil de conversão
      </h2>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <Filter
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">Funil ainda sem etapas</p>
          <p className="-mt-1 text-xs text-muted-foreground">
            As etapas do funil comercial aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((s) => {
            const pct = base > 0 ? Math.round((s.count / base) * 100) : 0
            const alpha = (0.35 + (pct / 100) * 0.65).toFixed(2)
            return (
              <div key={s.stage}>
                <div className="mb-[5px] flex items-baseline justify-between">
                  <span className="text-[12.5px] font-medium">{s.stage}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{s.count}</span>
                </div>
                <div className="h-[22px] overflow-hidden rounded-md bg-muted">
                  {pct > 0 && (
                    <div
                      className="flex h-full items-center justify-end rounded-md pr-2"
                      style={{ width: `${pct}%`, background: `hsl(var(--primary)/${alpha})` }}
                    >
                      {pct >= 12 && (
                        <span className="text-[10.5px] font-semibold text-primary-foreground">
                          {pct}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {lost.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-2.5 border-t border-border pt-3">
              {lost.map((s) => {
                // % relativa aos leads que entraram (base do funil), não à
                // maior etapa — mede "quantos dos leads foram perdidos".
                const pct = base > 0 ? Math.round((s.count / base) * 100) : 0
                const width = Math.min(pct, 100)
                const alpha = (0.35 + (width / 100) * 0.65).toFixed(2)
                return (
                  <div key={s.stage}>
                    <div className="mb-[5px] flex items-baseline justify-between">
                      <span className="text-[12.5px] font-medium">{s.stage}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{s.count}</span>
                    </div>
                    <div className="h-[22px] overflow-hidden rounded-md bg-muted">
                      {width > 0 && (
                        <div
                          className="flex h-full items-center justify-end rounded-md pr-2"
                          style={{
                            width: `${width}%`,
                            background: `hsl(var(--destructive)/${alpha})`,
                          }}
                        >
                          {pct >= 12 && (
                            <span className="text-[10.5px] font-semibold text-destructive-foreground">
                              {pct}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
