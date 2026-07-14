/**
 * Loading genérico do domínio clínica — skeleton com shimmer (redesign:
 * nunca spinner; design.md §5 "Estados"). As pages com layout próprio
 * (ex.: overview) trazem skeletons específicos via Suspense.
 */
export default function ClientLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <div className="senno-shimmer h-8 w-48 rounded-lg" />
        <div className="senno-shimmer h-9 w-32 rounded-lg" />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-[13px] border border-border bg-card p-[18px] shadow-card"
          >
            <div className="senno-shimmer h-[13px] w-24 rounded-md" />
            <div className="senno-shimmer h-7 w-32 rounded-[7px]" />
          </div>
        ))}
      </div>
      <div className="senno-shimmer h-64 rounded-[13px]" />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <div className="senno-shimmer h-48 rounded-[13px]" />
        <div className="senno-shimmer h-48 rounded-[13px]" />
      </div>
    </div>
  )
}
